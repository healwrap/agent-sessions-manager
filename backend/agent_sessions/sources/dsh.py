"""Read native DSH JSONL generations, including concatenated Zstandard frames."""
from __future__ import annotations
import io
import hashlib
import json
import re
import shutil
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from agent_sessions.context.text import compact_line
from .base import HistoryStore, as_text
from .codex import elapsed


@contextmanager
def transcript_stream(path):
    with path.open('rb') as handle:
        if path.suffix != '.zstd':
            yield handle
        else:
            try: import zstandard
            except ImportError as error: raise ValueError('读取 DSH 压缩日志需要安装 requirements.txt 中的 zstandard') from error
            try:
                with zstandard.ZstdDecompressor().stream_reader(handle, read_across_frames=True) as reader:
                    yield io.BufferedReader(reader)
            except zstandard.ZstdError as error:
                raise ValueError('DSH 压缩日志损坏或尚未写入完成') from error


class DshStore(HistoryStore):
    def __init__(self, root):
        super().__init__(root, 'dsh', 'local')
        self.raw_files = {}; self.decoded = {}; self.headers = {}; self.failures = {}; self.titles = {}; self.workspaces = {}
        self.temporary = tempfile.TemporaryDirectory(prefix='agent-sessions-dsh-')

    def discover(self):
        try:
            self.workspaces = json.loads((self.root/'storages/workspace.json').read_text(encoding='utf-8'))['tables']['workspaces']
            if not isinstance(self.workspaces, dict): self.workspaces = {}
        except (OSError, ValueError, KeyError, TypeError): self.workspaces = {}
        directory = self.root/'sessions' if (self.root/'sessions').is_dir() else self.root
        candidates = {}
        for path in directory.glob('*/*/session*.jsonl*'):
            match = re.fullmatch(r'session(?:\.v([1-9]\d*))?\.jsonl(?:\.zstd)?', path.name)
            if match: candidates.setdefault(str(path.parent.relative_to(directory)), []).append((int(match[1] or 0), path))
        try:
            cache = json.loads((self.root/'storages/session_projcache.json').read_text(encoding='utf-8')).get('tables', {}).get('sessions', {})
        except (OSError, ValueError): cache = {}
        rows = {}; raw_files = {}; failures = {}
        for key, generations in candidates.items():
            version = max(v for v, _ in generations)
            selected = [p for v, p in generations if v == version]
            path = selected[0]; stat = path.stat(); header = {}
            try:
                if len(selected) != 1: raise ValueError('同一代 DSH 日志存在重复文件，请在来源设置中指定唯一目录')
                revision = (str(path), stat.st_size, stat.st_mtime_ns)
                old = self.headers.get(key)
                if old and old[0] == revision: header = old[1]
                else:
                    with transcript_stream(path) as stream:
                        line = stream.readline(1024*1024+1)
                    if len(line) > 1024*1024 or not line.endswith(b'\n'): raise ValueError('DSH 会话头不完整')
                    header = json.loads(line)
                    if header.get('type') != 'session' or header.get('version') != version: raise ValueError('DSH 日志文件与会话头版本不一致')
                    self.headers[key] = (revision, header)
                if version > 4: raise ValueError(f'暂不支持 DSH 日志版本 v{version}')
            except (ValueError, OSError) as error: failures[key] = str(error)
            projection = cache.get(header.get('id', path.parent.name), {})
            projection_path = self.root/'storages/session_projcache/sessions'/(str(header.get('id', path.parent.name))+'.json')
            if projection_path.parent == self.root/'storages/session_projcache/sessions':
                try:
                    projection = json.loads(projection_path.read_text(encoding='utf-8'))['record']
                except (OSError, ValueError, KeyError): pass
            title = projection.get('rows', {}).get('title', {}).get('val')
            if self.titles.get(key, (None,))[0] == (str(path), stat.st_size, stat.st_mtime_ns):
                title = self.titles[key][1]
            cwd = header.get('cwd') or projection.get('identity', {}).get('cwd') or ''
            rows[key] = {'id': key, 'native_id': header.get('id', path.parent.name), 'title': title or path.parent.name,
                         'cwd': cwd, 'updated_at': datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(),
                         'transcript_available': key not in failures, 'unavailable_reason': failures.get(key),
                         **self.project(header.get('id', path.parent.name), cwd)}
            raw_files[key] = path
        self.rows, self.raw_files, self.failures = rows, raw_files, failures
        self.files = {key: self.decoded[key][1] if key in self.decoded else path for key, path in raw_files.items()}
        return list(rows.values())

    def project(self, native, cwd=None):
        directory = super().project(native, cwd)
        memberships = []; same_path = []
        for key, workspace in self.workspaces.items():
            if not isinstance(workspace, dict) or not isinstance(workspace.get('path'), str) or not workspace['path']: continue
            path = str(Path(workspace['path']).expanduser().resolve())
            title = workspace.get('title')
            project = {'project_id': 'dsh:workspace:'+key, 'project_label': title if isinstance(title, str) and title else Path(path).name,
                       'project_path': path, 'project_source': 'membership'}
            sessions = workspace.get('sessionIds')
            if isinstance(sessions, list) and native in sessions: memberships.append(project)
            if path == directory['project_path']: same_path.append(project)
        candidates = memberships or same_path
        return candidates[0] if len(candidates) == 1 else directory

    def session(self, key):
        with self.lock:
            self.discover()
            if key not in self.raw_files: raise FileNotFoundError('没有找到 DSH 会话')
            source = self.raw_files[key]; stat = source.stat()
            if key in self.failures:
                return {'source': source, 'events': [], 'lookup': {}, 'turns': [],
                        'index': {'meta': {'title': self.rows[key]['title'], 'cwd': self.rows[key]['cwd']},
                                  'source_size': stat.st_size, 'source_mtime_ns': stat.st_mtime_ns}}
            version = (str(source), stat.st_size, stat.st_mtime_ns)
            old = self.decoded.get(key)
            if not old or old[0] != version:
                target = Path(self.temporary.name)/(hashlib.sha256(key.encode()).hexdigest()+'.jsonl')
                with transcript_stream(source) as reader, target.open('wb') as writer:
                    shutil.copyfileobj(reader, writer, 128*1024)
                after = source.stat()
                if (after.st_size, after.st_mtime_ns) != version[1:]:
                    raise OSError('DSH 会话正在更新，请稍后重试')
                self.decoded[key] = (version, target)
                self.indexes.pop(key, None)
                while len(self.decoded) > 5:
                    victim = next(k for k in self.decoded if k != key)
                    self.decoded.pop(victim)[1].unlink(missing_ok=True)
                    self.indexes.pop(victim, None)
            self.files[key] = self.decoded[key][1]
            data = super().session(key)
            title = next((r['title'] for _, _, r in reversed(self.indexes[key]['rows']) if r['type'] == 'session/title' and r['title']), None)
            if title:
                self.titles[key] = (version, title)
                self.rows[key]['title'] = data['index']['meta']['title'] = title
            data['index']['source_size'] = stat.st_size
            data['index']['source_mtime_ns'] = stat.st_mtime_ns
            return data

    def detail(self, key, *args, **kwargs):
        result = super().detail(key, *args, **kwargs)
        return {**result, 'source': str(self.raw_files[key])}

    def matches_content(self, key, query):
        # Compressed source versions, rather than disposable decoded paths, own freshness.
        with self.lock:
            self.discover()
            source = self.raw_files[key]; stat = source.stat()
            version = (str(source), stat.st_size, stat.st_mtime_ns, query.casefold())
            if self.search_matches.get(key, (None,))[0] != version:
                data = self.session(key)
                found = any(query.casefold() in self.message_search_text(data, data['lookup'][e['ref']][1]).casefold()
                            for e in data['events'] if e['kind'] in ('user', 'assistant'))
                self.search_matches[key] = (version, found)
            return self.search_matches[key][1]

    def metadata(self, row):
        data = row.get('data') or {}; kind = row.get('type')
        message = data.get('message', data)
        content = message.get('content', [])
        result = {'type': kind, 'seq': row.get('seq'), 'turn': data.get('turn'), 'step': data.get('step'),
                  'timestamp': datetime.fromtimestamp(row['time']/1000, timezone.utc).isoformat() if isinstance(row.get('time'), (int, float)) else None,
                  'source_kind': message.get('source', {}).get('kind') if isinstance(message.get('source'), dict) else None,
                  'preview': compact_line(as_text(content), 420), 'reasoning': compact_line(self.content(content, 'reasoning'), 420),
                  'name': data.get('name'), 'call_id': data.get('callId'), 'input': compact_line(str(data.get('arguments', '')), 420),
                  'results': [], 'reason': data.get('reason'), 'title': data.get('title')}
        if kind == 'tool/result':
            if message.get('toolCallId'):
                result['results'].append({'id': message['toolCallId'], 'error': bool(message.get('isError')), 'block': None,
                                          'preview': compact_line(as_text(content), 420), 'chars': len(as_text(content))})
            else:
                result['results'] = [{'id': b.get('toolCallId'), 'error': bool(b.get('isError')), 'block': i,
                                      'preview': compact_line(as_text(b.get('content')), 420), 'chars': len(as_text(b.get('content')))}
                                     for i, b in enumerate(content) if isinstance(b, dict) and b.get('type') == 'tool-result']
        return result

    @staticmethod
    def content(blocks, kind):
        if isinstance(blocks, str): return blocks if kind == 'text' else ''
        return '\n'.join(str(b.get('text', '')) for b in (blocks or []) if isinstance(b, dict) and b.get('type') == kind)

    def events(self, rows):
        events = []; lookup = {}; turns = {}; calls = {}; outputs = {}; current = 1
        def add(r, offset, line, kind, name, preview, part='text', suffix=''):
            ref = 'E/'+str(r['seq'])+suffix
            event = {'ref': ref, 'turn': r.get('turn') or current, 'kind': kind, 'name': name, 'preview': preview,
                     'timestamp': r['timestamp'], 'status': 'pending' if kind == 'tool' else 'completed',
                     'line': line, 'duration_ms': None, 'phase': 'reasoning' if part == 'reasoning' else None}
            location = {'offset': offset, 'line': line, 'part': part, 'text': preview}
            events.append(event); lookup[ref] = ('message' if kind in ('user', 'assistant') else 'call', location)
            return event, location
        for offset, line, r in rows:
            kind = r['type']
            if kind == 'session': continue
            if kind == 'turn/start':
                next_turn = r.get('turn') or current
                if next_turn != current and turns.get(current, {}).get('status') == 'in_progress':
                    turns[current]['status'] = 'aborted'
                current = next_turn; turns[current] = {'status': 'in_progress'}
            elif kind == 'turn/end':
                reason = r.get('reason') or {}; reason = reason.get('kind') if isinstance(reason, dict) else reason
                turns[r.get('turn') or current] = {'status': 'completed' if reason == 'completed' else 'aborted'}
            elif kind == 'user/message':
                user = r['source_kind'] in (None, 'user')
                add(r, offset, line, 'user' if user else 'context', '用户' if user else '上下文', r['preview'])
            elif kind == 'assistant/message':
                if r['reasoning']: add(r, offset, line, 'assistant', '助手', r['reasoning'], 'reasoning', '/R')
                if r['preview']: add(r, offset, line, 'assistant', '助手', r['preview'])
            elif kind == 'tool/call':
                event, loc = add(r, offset, line, 'tool', r['name'] or '工具', r['input'], 'arguments')
                calls.setdefault((event['turn'], r['step'], r['call_id']), []).append((event, loc))
            elif kind == 'tool/result':
                for output in r['results']:
                    loc = {'offset': offset, 'line': line, 'part': 'result', 'block': output['block']}
                    outputs.setdefault((r.get('turn') or current, r['step'], output['id']), []).append((loc, output, r))
            elif kind == 'system/message': add(r, offset, line, 'context', '系统提示词', r['preview'])
            elif kind == 'compaction/end': add(r, offset, line, 'context', '上下文压缩', '上下文已压缩，历史可见记录仍可查看')
        for identity, results in outputs.items():
            matching = calls.get(identity, [])
            if identity[2] and len(matching) == len(results) == 1:
                event, loc = matching[0]; output, metadata, record = results[0]
                loc['output'] = output; event['status'] = 'error' if metadata['error'] else 'completed'
                event['output_chars'] = metadata['chars']
                event['duration_ms'] = elapsed(event['timestamp'], record['timestamp'])
            else:
                for output, metadata, record in results:
                    event, location = add(record, output['offset'], output['line'], 'media', '执行结果', metadata['preview'],
                                          'result', '/'+str(metadata['block'] or 0))
                    event['turn'] = identity[0]
                    event['status'] = 'error' if metadata['error'] else 'completed'
                    location['block'] = metadata['block']
        events.sort(key=lambda e: e['line'])
        for event in events:
            state = turns.get(event['turn'], {'status': 'in_progress'})['status']
            event['turn_status'] = state
        for number, state in turns.items():
            last = next((e for e in reversed(events) if e['turn'] == number and e['kind'] in ('tool', 'assistant')), None)
            if state['status'] == 'completed' and last and last['kind'] == 'assistant' and last['phase'] != 'reasoning': last['phase'] = 'final_answer'
        return events, lookup, [turns[n] for n in sorted(turns)], {}

    def body(self, row, location):
        data = row.get('data') or {}; message = data.get('message', data)
        if location['part'] == 'arguments': return str(data.get('arguments', ''))
        if location['part'] == 'result' and location.get('block') is not None:
            return as_text(message['content'][location['block']].get('content'))
        if location['part'] == 'result': return as_text(message.get('content'))
        return self.content(message.get('content', []), location['part'])
