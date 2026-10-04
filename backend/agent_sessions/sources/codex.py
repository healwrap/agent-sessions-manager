#!/usr/bin/env python3
"""Local, read-only trajectory UI built on the existing bounded session parser."""
from __future__ import annotations

import json
import os
import re
import threading
import time
from datetime import datetime
from pathlib import Path

from agent_sessions.context.indexing import build_turns, load_index
from agent_sessions.context.rendering import raw_call_input, raw_call_output
from agent_sessions.context.nested_results import match_nested_results, nested_result_status
from agent_sessions.context.locator import codex_root, read_session_index, read_session_meta, unique_session_rows
from agent_sessions.context.text import compact_line
from .common import TrajectoryStore, PAGE_CHARS, elapsed, timestamp_ms, timeline_bounds

UUID = re.compile(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', re.I)
class Store(TrajectoryStore):
    def __init__(self, root):
        self.root = root.resolve()
        self.rows = {}
        self.lock = threading.RLock()
        self.files = {}
        self.loaded = {}
        self.session_meta = {}
        self.project_state = {}
        self.project_version = None
        self.catalogue_mtime = None
        self.catalogue_time = 0
        self.search_matches = {}

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
                state = json.loads(path.read_text(encoding='utf-8'))
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
            if not self.catalogue_time or current_mtime != self.catalogue_mtime or time.monotonic() - self.catalogue_time > 5:
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

    def discover(self):
        rows = []; offset = 0
        while True:
            page = self.sessions(offset=offset, limit=100)
            rows.extend(page['items'])
            if page['next_offset'] is None:
                self.rows = {row['id']: row for row in rows}
                return rows
            offset = page['next_offset']

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
                                 'nested_count': 0, 'duration_ms': None, 'status': 'unread',
                                 'output_chars': 0, 'result_match': 'unread'}
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
            statuses = {turn['seq']: turn['status'] for turn in turns}
            for position, event in enumerate(events):
                event['position'] = position
                event['turn_status'] = statuses[event['turn']]
            value = {'index': index, 'source': source, 'turns': turns, 'events': events, 'lookup': lookup,
                     'nested_results': {}}
            # Keep only a handful of active parsed sessions in the HTTP process.
            if len(self.loaded) >= 5:
                self.loaded.pop(next(iter(self.loaded)))
            self.loaded[key] = (version, value)
            return value

    def trajectory_search_text(self, data, event, record_type, record):
        if record_type == 'call':
            _, args = raw_call_input(data['source'], record)
            _, output = raw_call_output(data['source'], record) if record.get('output') else (None, '')
            return args+' '+output
        return record.get('text', '')

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
                parent = record['parent']
                output_available = event['result_match'] in ('sequence', 'indexed')
                if part == 'output':
                    if parent['ref'] not in data['nested_results']:
                        _, input_text = raw_call_input(source, parent)
                        raw, _ = raw_call_output(source, parent)
                        data['nested_results'][parent['ref']] = match_nested_results(
                            input_text if parent.get('input_offset') is not None else '', raw,
                            [child['name'] for child in parent['nested_calls']])
                    number = next(i for i, child in enumerate(parent['nested_calls']) if child['ref'] == ref)
                    result = data['nested_results'][parent['ref']].get(number)
                    output_available = result is not None
                    text = result['text'] if result else ''
                    event['result_match'] = result['method'] if result else 'unmatched'
                    event['output_chars'] = len(text)
                    if result:
                        event['status'] = nested_result_status(text)
                    else:
                        event['status'] = 'unmatched'
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
                    'shared_output': False,
                    'result_match': event.get('result_match'),
                    'parent_ref': record['parent']['ref'] if category == 'nested' else None,
                    'parent_output_available': bool(record['parent'].get('output')) if category == 'nested' else None,
                    'input_truncated': category == 'nested' and record.get('input_chars', 0) > len(text) and part == 'input'}
