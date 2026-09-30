#!/usr/bin/env python3
"""Local, read-only trajectory UI built on the existing bounded session parser."""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from session_context import build_turns, load_index, raw_call_input, raw_call_output
from session_locator import codex_root, read_session_index, read_session_meta, unique_session_rows
from session_text import compact_line

ASSETS = Path(__file__).resolve().parent.parent / 'assets' / 'trajectory'
UUID = re.compile(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', re.I)
PAGE_CHARS = 7000


def elapsed(start, end):
    try:
        return max(0, round((datetime.fromisoformat(end.replace('Z', '+00:00')) -
                             datetime.fromisoformat(start.replace('Z', '+00:00'))).total_seconds() * 1000))
    except (ValueError, TypeError, AttributeError):
        return None


class Store:
    def __init__(self, root):
        self.root = root.resolve()
        self.lock = threading.RLock()
        self.files = {}
        self.loaded = {}
        self.session_meta = {}
        self.project_state = {}
        self.project_version = None
        self.catalogue_mtime = None
        self.catalogue_time = 0
        self.refresh_files()

    def refresh_files(self):
        files = {}
        for name in ('sessions', 'archived_sessions'):
            for path in (self.root / name).rglob('rollout-*.jsonl'):
                match = UUID.search(path.name)
                if match and path.is_file():
                    key = match.group().lower()
                    if key not in files or path.stat().st_mtime_ns > files[key].stat().st_mtime_ns:
                        files[key] = path
        self.files = files
        self.catalogue_time = time.monotonic()

    def project(self, key, cwd=None):
        """Prefer explicit Desktop membership; never guess among projects sharing a path."""
        path = self.root / '.codex-global-state.json'
        version = path.stat().st_mtime_ns if path.exists() else None
        if version != self.project_version:
            try:
                state = json.loads(path.read_text())
                self.project_state = {k: state.get(k, {}) for k in
                                      ('local-projects', 'thread-project-assignments',
                                       'thread-workspace-root-hints', 'projectless-thread-ids')}
            except (OSError, ValueError):
                self.project_state = {}
            self.project_version = version
        state = self.project_state
        assignment = state.get('thread-project-assignments', {}).get(key) or {}
        project_id = assignment.get('projectId')
        project = state.get('local-projects', {}).get(project_id) or {}
        if project and assignment.get('projectKind') == 'local':
            roots = project.get('rootPaths') or []
            return {'project_id': 'project:'+project_id,
                    'project_label': project.get('name') or (Path(roots[0]).name if roots else '项目'),
                    'project_path': roots[0] if roots else '', 'project_source': 'membership'}
        if key in state.get('projectless-thread-ids', []):
            return {'project_id': 'projectless', 'project_label': '未分配项目',
                    'project_path': '', 'project_source': 'projectless'}
        cwd = cwd or state.get('thread-workspace-root-hints', {}).get(key)
        if cwd is None and key in self.files:
            source = self.files[key]
            if self.session_meta.get(key, (None,))[0] != source:
                self.session_meta[key] = (source, read_session_meta(source))
            cwd = self.session_meta[key][1].get('cwd')
        return {'project_id': 'directory:'+str(cwd or ''),
                'project_label': Path(cwd).name if cwd else '未分配项目',
                'project_path': cwd or '', 'project_source': 'directory'}

    def sessions(self, query='', offset=0, limit=30, project_id=''):
        with self.lock:
            index_path = self.root / 'session_index.jsonl'
            current_mtime = index_path.stat().st_mtime_ns if index_path.exists() else None
            if current_mtime != self.catalogue_mtime or time.monotonic() - self.catalogue_time > 5:
                self.refresh_files()
                self.catalogue_mtime = current_mtime
            rows = unique_session_rows(read_session_index(self.root))
            known = {row['id'] for row in rows}
            for key, path in self.files.items():
                if key not in known:
                    rows.append({'id': key, 'thread_name': '(无标题)',
                                 'updated_at': datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat()})
            rows.sort(key=lambda r: str(r.get('updated_at', '')), reverse=True)
            items = []
            groups = {}
            for row in rows:
                if row['id'] not in self.files:
                    continue
                project = self.project(row['id'])
                title = str(row.get('thread_name') or '(无标题)')
                if query and query.casefold() not in (title+' '+project['project_label']).casefold():
                    continue
                item = {'id': row['id'], 'title': title, 'updated_at': str(row.get('updated_at') or ''), **project}
                group = groups.setdefault(project['project_id'], {**project, 'count': 0})
                group['count'] += 1
                if not project_id or project_id == project['project_id']:
                    items.append(item)
            return {'items': items[offset:offset+limit], 'total': len(items),
                    'projects': list(groups.values()),
                    'next_offset': offset+limit if offset+limit < len(items) else None,
                    'current_id': os.environ.get('CODEX_THREAD_ID')}

    def session(self, key):
        if not UUID.fullmatch(key):
            raise ValueError('会话 ID 格式无效')
        with self.lock:
            if key not in self.files:
                self.refresh_files()
            if key not in self.files:
                raise FileNotFoundError('未找到本地会话')
            source = self.files[key]
            stat = source.stat()
            version = (stat.st_size, stat.st_mtime_ns)
            old = self.loaded.get(key)
            if old and old[0] == version:
                return old[1]
            title = next((r.get('thread_name') for r in reversed(read_session_index(self.root))
                          if r.get('id') == key), None)
            index = load_index(source, self.root, title)
            turns = build_turns(index)
            events = []
            lookup = {}
            for turn in turns:
                for msg in turn['messages']:
                    item = {'ref': msg['ref'], 'turn': turn['seq'], 'kind': msg['role'],
                            'name': '用户' if msg['role'] == 'user' else '助手',
                            'preview': compact_line(msg['text'], 420), 'timestamp': msg['timestamp'],
                            'status': 'completed', 'turn_status': turn['status'], 'line': msg.get('line_number', 0),
                            'phase': msg.get('phase')}
                    events.append(item)
                    lookup[msg['ref']] = ('message', msg)
                for call in turn['calls']:
                    output = call.get('output') or {}
                    item = {'ref': call['ref'], 'turn': turn['seq'], 'kind': 'tool',
                            'name': call['outer_name'], 'preview': compact_line(call.get('input_excerpt') or call.get('summary', ''), 420),
                            'timestamp': call['timestamp'], 'status': output.get('status', 'pending'),
                            'duration_ms': elapsed(call['timestamp'], output.get('timestamp')),
                            'line': call.get('line_number', 0), 'nested_count': len(call.get('nested_calls') or []),
                            'output_chars': output.get('output_chars', 0)}
                    events.append(item)
                    lookup[call['ref']] = ('call', call)
                    for nested in call.get('nested_calls') or []:
                        child = {**item, 'ref': nested['ref'], 'kind': 'subtool', 'name': nested['name'],
                                 'parent_ref': call['ref'], 'preview': compact_line(nested.get('input_excerpt', ''), 420),
                                 'nested_count': 0, 'duration_ms': None, 'status': 'shared'}
                        events.append(child)
                        lookup[child['ref']] = ('nested', {**nested, 'parent': call})
                for media in turn['media']:
                    item = {'ref': media['ref'], 'turn': turn['seq'], 'kind': 'media', 'name': media['media_kind'],
                            'preview': compact_line(media.get('original_path') or media.get('path') or media.get('url') or '嵌入媒体', 420),
                            'timestamp': turn.get('timestamp'), 'status': 'metadata',
                            'line': media.get('line_number', 0)}
                    events.append(item)
                    lookup[media['ref']] = ('media', media)
                for boundary in turn.get('boundaries', []):
                    item = {'ref': boundary['ref'], 'turn': turn['seq'], 'kind': 'context', 'name': '上下文',
                            'preview': '上下文压缩边界 · 历史可见记录保留', 'timestamp': boundary['timestamp'],
                            'status': 'completed', 'line': boundary['line_number']}
                    events.append(item)
                    lookup[boundary['ref']] = ('context', boundary)
            events.sort(key=lambda e: (e['line'], e['ref']))
            for position, event in enumerate(events):
                event['position'] = position
            value = {'index': index, 'source': source, 'turns': turns, 'events': events, 'lookup': lookup}
            # Keep only a handful of active parsed sessions in the HTTP process.
            if len(self.loaded) >= 5:
                self.loaded.pop(next(iter(self.loaded)))
            self.loaded[key] = (version, value)
            return value

    def trajectory(self, key, offset=0, limit=150, query='', kind='all'):
        with self.lock:
            data = self.session(key)
            events = data['events']
            accepts = lambda e: kind == 'all' or e['kind'] == kind or (kind == 'messages' and e['kind'] in {'user', 'assistant'})
            selected = [e for e in events if accepts(e) and
                        (not query or query.casefold() in (e['preview']+' '+e['name']+' '+e['ref']).casefold())]
            # Search full visible messages, while keeping response snippets bounded.
            if query:
                selected = []
                for event in events:
                    if not accepts(event):
                        continue
                    label = event['name']+' '+event['ref']+' '+event['preview']
                    record_type, record = data['lookup'][event['ref']]
                    if record_type == 'message':
                        label += ' '+record['text']
                    if query.casefold() in label.casefold():
                        selected.append(event)
            overview = []
            matched_refs = {e['ref'] for e in selected}
            matched_refs.update(e['parent_ref'] for e in selected if e.get('parent_ref'))
            stride = max(1, (len(events)+249)//250)
            for start in range(0, len(events), stride):
                chunk = events[start:start+stride]
                for category in ('user', 'assistant', 'tool', 'media', 'context'):
                    members = [e for e in chunk if e['kind'] == category]
                    if members:
                        overview.append({'position': members[0]['position'], 'kind': category, 'ref': members[0]['ref'],
                                         'end_position': members[-1]['position'],
                                         'search_match': any(e['ref'] in matched_refs for e in members),
                                         'count': len(members), 'turn': members[0]['turn'],
                                         'timestamp': members[0]['timestamp'], 'status': members[0]['status'],
                                         'duration_ms': members[0].get('duration_ms')})
            meta = data['index']['meta']
            return {'id': key, 'title': meta.get('title') or '(无标题)', 'cwd': meta.get('cwd'),
                    **self.project(key, meta.get('cwd')),
                    'events': selected[offset:offset+limit], 'total': len(selected), 'event_count': len(events),
                    'next_offset': offset+limit if offset+limit < len(selected) else None,
                    'turn_count': len(data['turns']), 'tool_count': sum(e['kind'] == 'tool' for e in events),
                    'current_status': data['turns'][-1]['status'] if data['turns'] else 'completed',
                    'overview': overview, 'compactions': meta.get('compactions', 0),
                    'warnings': meta.get('unrecognized_record_types') or {},
                    'source_size': data['index'].get('source_size', 0),
                    'version': data['index'].get('source_mtime_ns')}

    def detail(self, key, ref, page=1, part='input'):
        with self.lock:
            data = self.session(key)
            if ref not in data['lookup']:
                raise FileNotFoundError('该事件引用不存在，请刷新轨迹')
            category, record = data['lookup'][ref]
            event = next(e for e in data['events'] if e['ref'] == ref)
            source = data['source']
            output_available = False
            if category == 'message':
                text = record['text']
            elif category == 'call':
                output_available = bool(record.get('output'))
                if part == 'output':
                    _, text = raw_call_output(source, record)
                else:
                    _, text = raw_call_input(source, record)
            elif category == 'nested':
                output_available = bool(record['parent'].get('output'))
                if part == 'output':
                    _, text = raw_call_output(source, record['parent'])
                else:
                    text = record.get('input_excerpt', '')
            else:
                text = json.dumps({k: v for k, v in record.items()
                                   if k not in {'offset', 'raw_len'}}, ensure_ascii=False, indent=2)
            pages = max(1, (len(text)+PAGE_CHARS-1)//PAGE_CHARS)
            if page > pages:
                raise ValueError('页码超过内容长度')
            return {'event': event, 'text': text[(page-1)*PAGE_CHARS:page*PAGE_CHARS],
                    'page': page, 'pages': pages, 'total_chars': len(text), 'part': part,
                    'output_available': output_available, 'source': str(source),
                    'line': record.get('line_number') or event['line'], 'thread_id': key,
                    'nested': record.get('nested_calls') or [],
                    'shared_output': category == 'nested',
                    'input_truncated': category == 'nested' and record.get('input_chars', 0) > len(text) and part == 'input'}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Do not duplicate session titles, paths or query text into a service log.
        pass

    def respond(self, status, body, mime='application/json; charset=utf-8'):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            host = self.headers.get('Host', '')
            expected = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
            origin = self.headers.get('Origin')
            if host not in expected or self.headers.get('Sec-Fetch-Site') == 'cross-site' or (origin and origin != f'http://{host}'):
                self.respond(403, {'error': '仅允许本机页面访问'})
                return
            parsed = urlparse(self.path)
            q = parse_qs(parsed.query)
            get = lambda name, default='': q.get(name, [default])[0]
            integer = lambda name, default, low, high: max(low, min(high, int(get(name, str(default)))))
            if parsed.path == '/api/sessions':
                result = self.server.store.sessions(get('q'), integer('offset', 0, 0, 1_000_000), integer('limit', 30, 1, 100), get('project'))
            elif parsed.path == '/api/trajectory':
                result = self.server.store.trajectory(get('id'), integer('offset', 0, 0, 1_000_000), integer('limit', 150, 1, 250), get('q'), get('kind', 'all'))
            elif parsed.path == '/api/event':
                part = get('part', 'input')
                if part not in {'input', 'output'}:
                    raise ValueError('内容类型无效')
                result = self.server.store.detail(get('id'), get('ref'), integer('page', 1, 1, 1_000_000), part)
            else:
                name = {'/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css',
                        '/harness.css': 'harness.css', '/harness-wordmark.svg': 'harness-wordmark.svg',
                        '/harness-license.txt': 'harness-license.txt', '/marked.js': 'marked.js',
                        '/icons.svg': 'icons.svg',
                        '/marked-license.txt': 'marked-license.txt'}.get(parsed.path)
                if not name:
                    raise FileNotFoundError('页面不存在')
                path = ASSETS / name
                self.respond(200, path.read_bytes(), (mimetypes.guess_type(name)[0] or 'text/plain')+'; charset=utf-8')
                return
            self.respond(200, result)
        except FileNotFoundError as exc:
            self.respond(404, {'error': str(exc)})
        except (ValueError, OSError) as exc:
            self.respond(400, {'error': str(exc)})
        except Exception:
            self.respond(500, {'error': '读取失败，请刷新并查看会话格式警告'})


def main():
    parser = argparse.ArgumentParser(description='打开本地 Codex 轨迹界面')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--codex-home', type=Path, default=codex_root())
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.daemon_threads = True
    server.store = Store(args.codex_home)
    print(f'http://127.0.0.1:{server.server_port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
