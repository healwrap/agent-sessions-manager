"""Cursor's native SQLite catalogue and targeted JSON field reads."""
import hashlib
import json
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from agent_sessions.paths import file_uri_path
from .base import readonly_db


def decode(value, default=None):
    try: return json.loads(value) if isinstance(value, (str, bytes)) else default
    except ValueError: return default


def timestamp(value):
    if isinstance(value, str): return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        try: return datetime.fromtimestamp(value/1000, timezone.utc).isoformat()
        except (ValueError, OverflowError, OSError): pass
    return ''


def local_path(value):
    if isinstance(value, dict):
        if value.get('scheme') not in (None, 'file'): return ''
        value = value.get('external') or value.get('fsPath') or value.get('path')
    if not isinstance(value, str): return ''
    if value.startswith('file:'): return file_uri_path(value)
    return value if Path(value).is_absolute() else ''


def fingerprint(paths):
    values = []
    for path in paths:
        for file in (path, Path(str(path)+'-wal')):
            if file.exists():
                stat = file.stat()
                values.append((str(file), stat.st_size, stat.st_mtime_ns, stat.st_ino))
    return hashlib.sha256(repr(values).encode()).hexdigest()


@contextmanager
def database(path):
    db, temporary = readonly_db(path)
    try:
        db.execute('BEGIN')
        yield db
    finally:
        db.close()
        if temporary: temporary.cleanup()


def tables(db):
    return {r[0] for r in db.execute("select name from sqlite_master where type='table'")}


def fields(db, table, key, paths):
    # Only fixed, known table names enter SQL; keys and JSON paths are parameters.
    if table not in ('ItemTable', 'cursorDiskKV'): raise ValueError('未知会话表')
    query = ','.join('json_extract(value,?)' for _ in paths)
    row = db.execute('select '+query+' from '+table+' where key=? and json_valid(value)', (*paths, key)).fetchone()
    return row


def workspace(path):
    try: value = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError): return ''
    return local_path(value.get('folder') or value.get('workspace')) if isinstance(value, dict) else ''


def read_headers(db, available):
    headers = []
    if 'ItemTable' in available:
        for key in ('composer.composerHeaders', 'composer.composerData'):
            row = fields(db, 'ItemTable', key, ('$.allComposers',))
            values = decode(row[0], []) if row else []
            if isinstance(values, list): headers.extend(h for h in values if isinstance(h, dict))
    if 'composerHeaders' in available:
        gate = db.execute("select value from ItemTable where key='composer.composerHeaders.tableGateEnabled'").fetchone() if 'ItemTable' in available else None
        if not headers or gate and decode(gate[0]) is True:
            headers = [decode(r[0], {}) for r in db.execute('select value from composerHeaders')]
    return [h for h in headers if isinstance(h, dict) and isinstance(h.get('composerId'), str) and h['composerId']]


def catalogue(path, fallback_cwd=''):
    from .cursor_family import family_headers
    with database(path) as db:
        available = tables(db)
        kv = 'cursorDiskKV' if 'cursorDiskKV' in available else 'ItemTable'
        keys = {r[0][len('composerData:'):] for r in db.execute('select key from '+kv+" where key glob 'composerData:*'")} if kv in available else set()
        headers = read_headers(db, available)
        if not headers:
            # Older stores sometimes have bodies without a separate header list.
            for key in keys:
                row = fields(db, kv, 'composerData:'+key, ('$.name', '$.createdAt', '$.lastUpdatedAt', '$.workspaceIdentifier', '$.isDraft'))
                if row:
                    headers.append(dict(composerId=key, name=row[0], createdAt=row[1], lastUpdatedAt=row[2], workspaceIdentifier=decode(row[3], {}), isDraft=row[4]))
        rows = []
        for header in family_headers(db, kv, headers, keys):
            if header.get('isDraft'): continue
            key = header['composerId']
            # A global header owns workspace identity. Do not use an unrelated
            # workspace's last-focused list to claim that same conversation.
            identity = header.get('workspaceIdentifier') or {}
            cwd = local_path(identity.get('uri')) if isinstance(identity, dict) else ''
            if not identity: cwd = fallback_cwd
            rows.append({**header, 'id': key, 'native_id': key, 'title': header.get('name') or '(无标题)', 'cwd': cwd,
                         'updated_at': timestamp(header.get('lastUpdatedAt') or header.get('createdAt')),
                         'transcript_available': key in keys, '_table': kv, '_source': path})
        return rows


def conversation(db, table, key):
    parent = 'composerData:'+key
    row = fields(db, table, parent, ('$.status', '$.fullConversationHeadersOnly', '$.subagentInfo.conversationLengthAtSpawn'))
    if not row: return None, [], {'cursor_missing_body': 1}
    inherited = row[2] if isinstance(row[2], int) and row[2] > 0 else 0
    headers = decode(row[1], [])
    if isinstance(headers, list) and headers:
        locations = []
        seen = set()
        for index, h in enumerate(headers):
            if not isinstance(h, dict) or not isinstance(h.get('bubbleId'), str): continue
            if h['bubbleId'] in seen: continue
            seen.add(h['bubbleId'])
            locations.append({'key': 'bubbleId:'+key+':'+h['bubbleId'], 'path': '$', 'bubble_id': h['bubbleId'],
                              'header': h, 'inherited': index < inherited})
        return row[0], locations, {}
    # Before split bubble storage, the complete conversation lived in one row.
    for name in ('conversation', 'fullConversation', 'conversationMap'):
        kind = db.execute('select json_type(value,?) from '+table+' where key=? and json_valid(value)', ('$.'+name, parent)).fetchone()
        if not kind or kind[0] not in ('array', 'object'): continue
        locations = []
        for ordinal, (index, bubble_id) in enumerate(db.execute('select j.key,json_extract(j.value,\'$.bubbleId\') from '+table+' s,json_each(s.value,?) j where s.key=? and json_valid(s.value) and j.type=\'object\'', ('$.'+name, parent))):
            suffix = '['+str(index)+']' if kind[0] == 'array' else '.'+json.dumps(str(index))
            locations.append({'key': parent, 'path': '$.'+name+suffix, 'bubble_id': bubble_id or str(index),
                              'header': {}, 'inherited': ordinal < inherited})
        if locations: return row[0], locations, {}
    return row[0], [], {'cursor_empty_or_unsupported_body': 1}


def bubble(db, table, location):
    base = location['path']
    names = ('type', 'createdAt', 'isSimulatedMsg', 'isCanceled', 'isCancelled', 'toolFormerData.name',
             'toolFormerData.status', 'toolFormerData.toolCallId')
    paths = [base+'.'+name for name in names]
    row = fields(db, table, location['key'], paths)
    if not row: return None
    text = fields(db, table, location['key'], (base+'.text',))[0]
    args = fields(db, table, location['key'], (base+'.toolFormerData.rawArgs', base+'.toolFormerData.params'))
    output = db.execute('select json_type(value,?) from '+table+' where key=? and json_valid(value)', (base+'.toolFormerData.result', location['key'])).fetchone()[0]
    media = db.execute('select '+','.join('json_array_length(value,?)' for _ in range(3))+' from '+table+' where key=? and json_valid(value)',
                       (base+'.images', base+'.context.selectedImages', base+'.context.selectedVideos', location['key'])).fetchone()
    return dict(zip(names, row), text=text if isinstance(text, str) else '', args=next((v for v in args if v is not None and v != ''), ''),
                output_available=output not in (None, 'null'), media_count=sum(value or 0 for value in media))


def body(db, table, location, part):
    base = location['path']
    paths = (base+'.toolFormerData.result',) if part == 'output' else ((base+'.toolFormerData.rawArgs', base+'.toolFormerData.params') if location['kind'] == 'tool' else (base+'.text',))
    row = fields(db, table, location['key'], paths)
    if not row: raise FileNotFoundError('此 Cursor 消息已不存在')
    value = next((v for v in row if v is not None and v != ''), '')
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
