"""Shared bounded transcript reading and WAL-safe database access."""
from __future__ import annotations
import json
import sqlite3
import tempfile
import threading
import shutil
from pathlib import Path
from .common import TrajectoryStore, PAGE_CHARS

def as_text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return '\n'.join(str(b.get('text', '')) for b in value if isinstance(b, dict) and b.get('type') == 'text')
    return json.dumps(value, ensure_ascii=False, indent=2) if value is not None else ''


def read_row(path, offset):
    with path.open('rb') as handle:
        handle.seek(offset)
        return json.loads(handle.readline())


def readonly_db(path):
    """Read WAL normally; fallback to a verified private DB+WAL snapshot."""
    try:
        db = sqlite3.connect(path.resolve().as_uri()+'?mode=ro', uri=True)
        db.execute('select name from sqlite_master limit 1').fetchone()
        return db, None
    except sqlite3.Error:
        if 'db' in locals():
            db.close()
    # Some local runtimes cannot open the source shared-memory file. Never use
    # immutable on a live DB: copy the committed WAL with the database instead.
    for _ in range(3):
        temporary = tempfile.TemporaryDirectory(prefix='agent-sessions-db-')
        files = [path] + ([Path(str(path)+'-wal')] if Path(str(path)+'-wal').exists() else [])
        before = [(p.stat().st_size, p.stat().st_mtime_ns) for p in files]
        target = Path(temporary.name)/path.name
        try:
            for original in files:
                shutil.copyfile(original, Path(temporary.name)/original.name)
            after = [(p.stat().st_size, p.stat().st_mtime_ns) for p in files]
            if before == after and Path(str(path)+'-wal').exists() == (len(files) == 2):
                db = sqlite3.connect(target)
                db.execute('PRAGMA query_only=ON')
                return db, temporary
        except OSError:
            pass
        temporary.cleanup()
    raise OSError('会话数据库正在写入，请稍后重试')


class HistoryStore(TrajectoryStore):
    def __init__(self, root, provider, instance):
        self.root = root.expanduser().resolve()
        self.provider, self.instance = provider, instance
        self.lock = threading.RLock()
        self.loaded = {}
        self.files = {}
        self.rows = {}
        self.indexes = {}
        self.search_full = False
        self.search_matches = {}

    def message_search_text(self, data, record):
        return self.body(read_row(data['source'], record['offset']), record)

    def trajectory_search_text(self, data, event, record_type, record):
        if record.get('alias'): return ''
        values = [self.body(read_row(data['source'], record['offset']), record)]
        if record.get('output'):
            output = record['output']
            values.append(self.body(read_row(data['source'], output['offset']), output))
        return ' '.join(values)

    def project(self, key, cwd=None):
        cwd = cwd or self.rows.get(key, {}).get('cwd') or ''
        path = str(Path(cwd).expanduser().resolve()) if cwd else ''
        return {'project_id': 'directory:'+path if path else 'projectless',
                'project_label': Path(path).name if path else '未分配项目',
                'project_path': path, 'project_source': 'directory'}

    def index(self, key):
        path = self.files[key]
        stat = path.stat()
        old = self.indexes.get(key)
        if old and old['version'] == (stat.st_size, stat.st_mtime_ns):
            return old
        append = old and stat.st_size > old['size'] and old['mtime'] <= stat.st_mtime_ns and old['inode'] == stat.st_ino
        # Check the previously indexed prefix before trusting an append.
        import hashlib
        with path.open('rb') as handle:
            prefix = hashlib.sha256(handle.read(min(4096, old['size'] if old else stat.st_size))).hexdigest()
            if append:
                handle.seek(max(0, old['size']-4096))
                tail = hashlib.sha256(handle.read(min(4096, old['size']))).hexdigest()
                append = tail == old['tail']
        if append and prefix != old['prefix']:
            append = False
        rows = list(old['rows']) if append else []
        offset = old['offset'] if append else 0
        with path.open('rb') as handle:
            handle.seek(offset)
            line = old['line'] if append else 0
            while True:
                position = handle.tell()
                raw = handle.readline()
                if not raw or not raw.endswith(b'\n'):
                    break
                offset = handle.tell(); line += 1
                try:
                    record = json.loads(raw)
                    if isinstance(record, dict):
                        rows.append((position, line, self.metadata(record)))
                except ValueError:
                    continue
        with path.open('rb') as handle:
            prefix = hashlib.sha256(handle.read(min(4096, stat.st_size))).hexdigest()
            handle.seek(max(0, stat.st_size-4096))
            tail = hashlib.sha256(handle.read(min(4096, stat.st_size))).hexdigest()
        value = {'rows': rows, 'offset': offset, 'line': line, 'size': stat.st_size,
                 'mtime': stat.st_mtime_ns, 'prefix': prefix, 'tail': tail, 'inode': stat.st_ino,
                 'version': (stat.st_size, stat.st_mtime_ns)}
        self.indexes[key] = value
        return value

    def metadata(self, row):
        raise NotImplementedError

    def session(self, key):
        with self.lock:
            self.discover()
            if key not in self.files:
                raise FileNotFoundError('没有找到该来源的会话记录')
            index = self.index(key)
            row = self.rows[key]
            events, lookup, turns, warnings = self.events(index['rows'])
            for position, event in enumerate(events):
                event['position'] = position
            return {'source': self.files[key], 'events': events, 'lookup': lookup, 'turns': turns,
                    'index': {'meta': {'title': row['title'], 'cwd': row.get('cwd'),
                                      'compactions': sum(e['kind'] == 'context' and e['name'] == '上下文压缩' for e in events),
                                      'unrecognized_record_types': warnings},
                              'source_size': index['size'], 'source_mtime_ns': index['mtime']}}

    def detail(self, key, ref, page=1, part='input'):
        with self.lock:
            data = self.session(key)
            if ref not in data['lookup']:
                raise FileNotFoundError('该事件不存在')
            _, record = data['lookup'][ref]
            if record.get('alias'):
                result = self.detail(key, record['alias'], page, 'output')
                return {**result, 'parent_ref': record['alias']}
            event = next(e for e in data['events'] if e['ref'] == ref)
            location = record.get('output') if part == 'output' else record
            text = self.body(read_row(data['source'], location['offset']), location) if location else ''
            pages = max(1, (len(text)+PAGE_CHARS-1)//PAGE_CHARS)
            if page > pages:
                raise ValueError('页码超过内容长度')
            return {'event': event, 'text': text[(page-1)*PAGE_CHARS:page*PAGE_CHARS],
                    'page': page, 'pages': pages, 'total_chars': len(text), 'part': part,
                    'output_available': bool(record.get('output')), 'source': str(data['source']),
                    'line': location['line'] if location else event['line'], 'thread_id': key,
                    'nested': [], 'shared_output': False, 'parent_ref': None,
                    'input_truncated': False, 'parent_output_available': False,
                    'hierarchy_parent_ref': event.get('parent_ref')}

    def body(self, row, location):
        raise NotImplementedError
