"""Source adapters. Original histories remain read-only; bodies are read on demand."""
from __future__ import annotations
import json
import os
import sqlite3
import tempfile
import threading
import shutil
import time
from collections import Counter
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlparse
from codex_source import Store, PAGE_CHARS, elapsed
from session_text import compact_line

LABELS = {'codex': 'Codex', 'claude': 'Claude Code', 'antigravity': 'Antigravity'}


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
        db = sqlite3.connect('file:'+str(path)+'?mode=ro', uri=True)
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


class HistoryStore(Store):
    def __init__(self, root, provider, instance):
        self.root = root.expanduser().resolve()
        self.provider, self.instance = provider, instance
        self.lock = threading.RLock()
        self.loaded = {}
        self.files = {}
        self.rows = {}
        self.indexes = {}
        self.search_full = False

    def trajectory(self, key, offset=0, limit=150, query='', kind='all'):
        with self.lock:
            self.search_full = bool(query)
            try:
                return super().trajectory(key, offset, limit, query, kind)
            finally:
                self.search_full = False

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
            if self.search_full:
                for category, location in lookup.values():
                    if category == 'message':
                        location['text'] = self.body(read_row(self.files[key], location['offset']), location)
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
                    'input_truncated': False, 'parent_output_available': False}

    def body(self, row, location):
        raise NotImplementedError


class ClaudeStore(HistoryStore):
    def __init__(self, root):
        super().__init__(root, 'claude', 'local')

    def discover(self):
        self.files = {str(p.relative_to(self.root/'projects')).removesuffix('.jsonl'): p
                      for p in (self.root/'projects').glob('*/**/*.jsonl') if p.is_file()}
        for key, path in self.files.items():
            index = self.index(key)
            title = None; cwd = ''; native = path.stem
            for _, _, item in index['rows']:
                cwd = item.get('cwd') or cwd; native = item.get('session_id') or native
                title = item.get('title') or title
            first = next((i['preview'] for _, _, i in index['rows'] if i.get('role') == 'user' and i.get('preview')), None)
            self.rows[key] = {'id': key, 'native_id': native, 'title': title or first or path.stem,
                              'cwd': cwd, 'updated_at': datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat(),
                              'is_subagent': '/subagents/' in '/'+key,
                              **self.project(key, cwd)}
        self.rows = {k: v for k, v in self.rows.items() if k in self.files}
        return list(self.rows.values())

    def metadata(self, row):
        msg = row.get('message') or {}
        content = msg.get('content', []) if isinstance(msg, dict) else ''
        result = {'type': row.get('type'), 'uuid': row.get('uuid'), 'parent': row.get('parentUuid'),
                  'timestamp': row.get('timestamp'), 'cwd': row.get('cwd'), 'session_id': row.get('sessionId'),
                  'title': row.get('customTitle'), 'leaf': row.get('leafUuid'), 'sidechain': row.get('isSidechain'),
                  'role': row.get('type'), 'preview': compact_line(as_text(content), 420), 'blocks': []}
        for number, block in enumerate(content if isinstance(content, list) else []):
            if not isinstance(block, dict):
                continue
            kind = block.get('type')
            if kind in ('tool_use', 'tool_result'):
                result['blocks'].append({'number': number, 'type': kind, 'id': block.get('id') or block.get('tool_use_id'),
                                         'name': block.get('name'), 'error': block.get('is_error', False),
                                         'preview': compact_line(as_text(block.get('input')), 420) if kind == 'tool_use' else ''})
        return result

    def events(self, rows):
        by_uuid = {r['uuid']: (o, n, r) for o, n, r in rows if r.get('uuid')}
        # Follow the current leaf, retaining native parent links instead of flattening forks.
        leaf = next((r.get('leaf') or r.get('uuid') for _, _, r in reversed(rows) if r.get('leaf') or r.get('uuid')), None)
        active = set(); cursor = leaf
        while cursor and cursor not in active:
            active.add(cursor); cursor = by_uuid.get(cursor, (0, 0, {}))[2].get('parent')
        events = []; lookup = {}; turn = 0; counts = Counter(); calls = {}; outputs = {}
        def add(ref, kind, name, preview, r, loc, phase=None):
            counts[(turn, kind)] += 1
            event = {'ref': ref, 'turn': max(1, turn), 'kind': kind, 'name': name, 'preview': preview,
                     'timestamp': r.get('timestamp'), 'status': 'pending' if kind == 'tool' else 'completed',
                     'line': loc['line'], 'turn_status': 'completed', 'phase': phase,
                     'duration_ms': None, 'native_id': r.get('uuid'), 'native_parent_id': r.get('parent')}
            events.append(event); lookup[ref] = ('message' if kind in ('user', 'assistant') else 'call', loc)
            if kind in ('user', 'assistant'): loc['text'] = preview
            return event
        for offset, line, r in rows:
            if r.get('uuid') and (r['uuid'] not in active or by_uuid[r['uuid']][0] != offset):
                continue
            if r['type'] not in ('user', 'assistant', 'system'):
                continue
            if r['type'] == 'system':
                continue
            visible = r['preview']
            if r['type'] == 'user' and visible:
                turn += 1
            uid = r.get('uuid') or str(line)
            loc = {'offset': offset, 'line': line, 'part': 'text'}
            if visible:
                add('M/'+uid, r['type'], '用户' if r['type'] == 'user' else '助手', visible, r, loc)
            for block in r['blocks']:
                location = {'offset': offset, 'line': line, 'block': block['number'], 'part': block['type']}
                if block['type'] == 'tool_use':
                    ref = 'C/'+uid+'/'+str(block['number'])
                    event = add(ref, 'tool', block['name'] or '工具', block['preview'], r, location)
                    calls.setdefault(block['id'], []).append((event, location, r))
                else:
                    outputs.setdefault(block['id'], []).append((location, block, r))
        for key, matching in calls.items():
            results = outputs.get(key, [])
            if key and len(matching) == 1 and len(results) == 1:
                event, location, call = matching[0]; output, result, record = results[0]
                location['output'] = output
                event['status'] = 'error' if result['error'] else 'completed'
                event['duration_ms'] = elapsed(call.get('timestamp'), record.get('timestamp'))
        turns = [{'status': 'completed'} for _ in range(max(1, turn))]
        # Explicitly show the final visible assistant text in each completed turn.
        for number in range(1, max(1, turn)+1):
            last = next((e for e in reversed(events) if e['turn'] == number), None)
            if last and last['kind'] == 'assistant': last['phase'] = 'final_answer'
            elif last:
                turns[number-1]['status'] = 'in_progress'
                for e in events:
                    if e['turn'] == number: e['turn_status'] = 'in_progress'
        return events, lookup, turns, {}

    def body(self, row, location):
        content = (row.get('message') or {}).get('content', '')
        if 'block' not in location:
            return as_text(content)
        block = content[location['block']]
        return as_text(block.get('input') if location['part'] == 'tool_use' else block.get('content'))


class AntigravityStore(HistoryStore):
    def __init__(self, root, instance):
        super().__init__(root, 'antigravity', instance)

    def discover(self):
        self.files = {p.parents[2].name: p for p in (self.root/'brain').glob('*/.system_generated/logs/transcript_full.jsonl')}
        summaries = {}
        path = self.root/'conversation_summaries.db'
        if path.exists():
            db, temporary = readonly_db(path)
            try:
                db.row_factory = sqlite3.Row
                summaries = {r['conversation_id']: dict(r) for r in db.execute('select conversation_id,title,workspace_uris,last_modified_time,status,parent_conversation_id from conversation_summaries')}
            finally:
                db.close()
                if temporary: temporary.cleanup()
        self.rows = {}
        for key in self.files.keys() | summaries.keys():
            file = self.files.get(key)
            item = summaries.get(key, {})
            try: roots = json.loads(item.get('workspace_uris') or '[]')
            except ValueError: roots = []
            cwd = unquote(urlparse(roots[0]).path) if roots and isinstance(roots[0], str) else ''
            self.rows[key] = {'id': key, 'native_id': key, 'title': item.get('title') or key,
                              'cwd': cwd, 'parent_session_id': item.get('parent_conversation_id'),
                              'updated_at': item.get('last_modified_time') or (datetime.fromtimestamp(file.stat().st_mtime).astimezone().isoformat() if file else ''),
                              'transcript_available': file is not None, 'native_status': item.get('status'),
                              **self.project(key, cwd)}
        return list(self.rows.values())

    def session(self, key):
        with self.lock:
            self.discover()
            if key in self.rows and key not in self.files:
                row = self.rows[key]
                return {'source': self.root/'brain'/key/'.system_generated/logs/transcript_full.jsonl',
                        'events': [], 'lookup': {}, 'turns': [],
                        'index': {'meta': {'title': row['title'], 'cwd': row['cwd']},
                                  'source_size': 0, 'source_mtime_ns': row['updated_at']}}
            return super().session(key)

    def metadata(self, row):
        return {'type': row.get('type'), 'step': row.get('step_index'), 'status': row.get('status'),
                'timestamp': row.get('created_at'), 'preview': compact_line(as_text(row.get('content')), 420),
                'error': compact_line(as_text(row.get('error')), 420),
                'calls': [{'number': n, 'name': c.get('name'), 'preview': compact_line(as_text(c.get('args')), 420)}
                          for n, c in enumerate(row.get('tool_calls') or []) if isinstance(c, dict)]}

    def events(self, rows):
        events = []; lookup = {}; turn = 0; warnings = Counter()
        # A step may be rewritten as it completes; only its latest snapshot is visible.
        latest = {r['step']: (offset, line, r) for offset, line, r in rows}
        for offset, line, r in sorted(latest.values(), key=lambda v: v[2]['step'] if isinstance(v[2]['step'], int) else v[0]):
            kind = r['type']; step = str(r['step'])
            if kind == 'USER_INPUT': turn += 1
            visible = r['preview'] or r['error']
            status = {'DONE': 'completed', 'ERROR': 'error', 'RUNNING': 'running'}.get(r['status'], r['status'] or 'metadata')
            if kind in ('USER_INPUT', 'PLANNER_RESPONSE', 'GENERIC', 'ERROR_MESSAGE') and visible:
                typ = 'user' if kind == 'USER_INPUT' else 'assistant' if kind == 'PLANNER_RESPONSE' else 'context'
                ref = 'S/'+step
                event = {'ref': ref, 'turn': max(1, turn), 'kind': typ,
                         'name': '用户' if typ == 'user' else '助手' if typ == 'assistant' else '执行记录',
                         'preview': visible, 'timestamp': r['timestamp'], 'status': 'error' if r['error'] or kind == 'ERROR_MESSAGE' else status,
                         'line': line, 'turn_status': 'completed', 'phase': None, 'native_id': r['step'], 'duration_ms': None}
                events.append(event); lookup[ref] = ('message', {'offset': offset, 'line': line, 'part': 'content', 'text': visible})
            for call in r['calls']:
                ref = 'S/'+step+'/C/'+str(call['number'])
                events.append({'ref': ref, 'turn': max(1, turn), 'kind': 'tool', 'name': call['name'] or '工具',
                               'preview': call['preview'], 'timestamp': r['timestamp'], 'status': 'unmatched',
                               'line': line, 'turn_status': 'completed', 'duration_ms': None,
                               'result_note': '此来源没有独立结果关联标识，执行记录单独展示。'})
                lookup[ref] = ('call', {'offset': offset, 'line': line, 'call': call['number'], 'part': 'args'})
            if kind not in ('USER_INPUT', 'PLANNER_RESPONSE', 'GENERIC', 'ERROR_MESSAGE', 'SYSTEM_MESSAGE'):
                warnings[kind or 'unknown'] += 1
        turns = [{'status': 'completed'} for _ in range(turn)]
        if events and turns and (events[-1]['status'] == 'running' or events[-1]['kind'] == 'user'):
            turns[-1]['status'] = 'in_progress'
            for event in events:
                if event['turn'] == turn: event['turn_status'] = 'in_progress'
        return events, lookup, turns, dict(warnings)

    def body(self, row, location):
        if 'call' in location:
            return as_text(row['tool_calls'][location['call']].get('args'))
        return as_text(row.get('content') or row.get('error'))


class MultiStore:
    def __init__(self, codex, claude, antigravity, antigravity_cli):
        self.codex = Store(codex)
        self.adapters = {'codex:local': self.codex, 'claude:local': ClaudeStore(claude),
                         'antigravity:desktop': AntigravityStore(antigravity, 'desktop'),
                         'antigravity:cli': AntigravityStore(antigravity_cli, 'cli')}
        self.errors = {}; self.project_overrides = {}
        self.catalogue_time = 0; self.catalogue_rows = []

    def sources(self):
        return {'items': [{'id': key, 'provider': key.split(':')[0], 'label': LABELS[key.split(':')[0]],
                           'instance': key.split(':')[1], 'path': str(a.root), 'available': a.root.exists(),
                           'error': self.errors.get(key), 'independent_results': key.split(':')[0] != 'antigravity'}
                          for key, a in self.adapters.items()]}

    def catalogue(self):
        if time.monotonic()-self.catalogue_time < 3:
            return self.catalogue_rows
        items = []
        for source, adapter in self.adapters.items():
            try:
                if source == 'codex:local':
                    first = adapter.sessions(limit=100)
                    rows = list(first['items']); next_offset = first['next_offset']
                    while next_offset is not None:
                        page = adapter.sessions(offset=next_offset, limit=100);rows.extend(page['items']);next_offset = page['next_offset']
                else:
                    with adapter.lock: rows = adapter.discover()
                self.errors.pop(source, None)
                for row in rows:
                    items.append({**row, 'id': source+':'+row['id'], 'native_id': row.get('native_id', row['id']),
                                  'provider': source.split(':')[0], 'provider_label': LABELS[source.split(':')[0]],
                                  'instance_id': source.split(':')[1]})
            except (OSError, ValueError, sqlite3.Error) as error:
                self.errors[source] = str(error)
        # Only merge a directory into a single explicit Codex project; ambiguous
        # roots remain independent until the user assigns a project in the UI.
        paths = {}
        for row in items:
            if row['provider'] == 'codex' and row['project_source'] == 'membership' and row['project_path']:
                paths.setdefault(str(Path(row['project_path']).resolve()), {})[row['project_id']] = row
        for row in items:
            candidates = paths.get(row.get('project_path'), {})
            if row['project_source'] == 'directory' and len(candidates) == 1:
                project = next(iter(candidates.values()))
                for field in ('project_id', 'project_label', 'project_path'): row[field] = project[field]
        self.catalogue_rows = sorted(items, key=lambda r: r['updated_at'], reverse=True)
        assignments = self.settings.read()['value'].get('projectAssignments', {}) if hasattr(self, 'settings') else {}
        for row in self.catalogue_rows:
            assigned = assignments.get(row['id'])
            if isinstance(assigned, dict) and all(isinstance(assigned.get(k), str) for k in ('project_id', 'project_label', 'project_path')):
                row.update({k: assigned[k] for k in ('project_id', 'project_label', 'project_path')})
                row['project_source'] = 'manual'
        self.project_overrides = {r['id']: {k: r[k] for k in ('project_id', 'project_label', 'project_path', 'project_source')} for r in self.catalogue_rows}
        self.catalogue_time = time.monotonic()
        return self.catalogue_rows

    def sessions(self, query='', offset=0, limit=30, project_id='', provider=''):
        rows = self.catalogue()
        selected = [r for r in rows if (not provider or r['provider'] == provider) and
                    (not query or query.casefold() in (r['title']+' '+r['project_label']).casefold())]
        projects = {}
        for row in selected:
            group = projects.setdefault(row['project_id'], {k: row[k] for k in ('project_id', 'project_label', 'project_path', 'project_source')})
            group['count'] = group.get('count', 0)+1
        filtered = [r for r in selected if not project_id or r['project_id'] == project_id]
        current = os.environ.get('CODEX_THREAD_ID')
        return {'items': filtered[offset:offset+limit], 'total': len(filtered), 'projects': list(projects.values()),
                'next_offset': offset+limit if offset+limit < len(filtered) else None,
                'current_id': 'codex:local:'+current if current else None, 'sources': self.sources()['items']}

    def resolve(self, key):
        parts = key.split(':', 2)
        if len(parts) == 3 and ':'.join(parts[:2]) in self.adapters:
            return ':'.join(parts[:2]), parts[2]
        # Preserve old Codex links and view settings.
        return 'codex:local', key

    def trajectory(self, key, *args, **kwargs):
        source, native = self.resolve(key)
        data = self.adapters[source].trajectory(native, *args, **kwargs)
        qualified = source+':'+native
        if qualified not in self.project_overrides: self.catalogue()
        row = self.adapters[source].rows.get(native, {}) if source.startswith('antigravity:') else {}
        return {**data, 'id': qualified, 'provider': source.split(':')[0], 'provider_label': LABELS[source.split(':')[0]],
                'instance_id': source.split(':')[1], **self.project_overrides.get(qualified, {}),
                'unavailable_reason': '此会话只有摘要记录，本机尚未保存可读取的对话轨迹。' if row.get('transcript_available') is False else None,
                'capabilities': {'independent_results': source.split(':')[0] != 'antigravity'}}

    def detail(self, key, *args, **kwargs):
        source, native = self.resolve(key)
        result = self.adapters[source].detail(native, *args, **kwargs)
        return {**result, 'provider': source.split(':')[0], 'provider_label': LABELS[source.split(':')[0]],
                'instance_id': source.split(':')[1]}

    def focus(self, key, *args):
        source, native = self.resolve(key)
        return self.adapters[source].focus(native, *args)
