"""Antigravity desktop and CLI exported transcript adapter."""
from __future__ import annotations
import json
import re
import sqlite3
from collections import Counter
from datetime import datetime
from agent_sessions.sources.codex import elapsed
from agent_sessions.context.text import compact_line
from agent_sessions.paths import file_uri_path
from .base import HistoryStore, readonly_db, as_text

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
            cwd = file_uri_path(roots[0]) if roots and isinstance(roots[0], str) else ''
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
        content = as_text(row.get('content'))
        timing = re.match(r'^Created At: ([^\n]+)\nCompleted At: ([^\n]+)\n', content)
        search = re.match(r'The search for "(.*?)" returned the following summary:', content[timing.end():], re.S) if timing else None
        file = re.match(r'File Path: `([^`\n]+)`\nTotal Lines: (\d+)\nTotal Bytes: \d+\nShowing lines (\d+) to (\d+)(?:\n|$)', content[timing.end():]) if timing else None
        return {'type': row.get('type'), 'step': row.get('step_index'), 'status': row.get('status'),
                'timestamp': row.get('created_at'), 'preview': compact_line(as_text(row.get('content')), 420),
                'error': compact_line(as_text(row.get('error')), 420),
                'execution_start': timing[1] if timing else None, 'execution_end': timing[2] if timing else None,
                'result_query': search[1] if search else None,
                'result_file': {'path': file_uri_path(file[1]), 'total': int(file[2]), 'start': int(file[3]), 'end': int(file[4])} if file else None,
                'execution_error': bool(timing and content[timing.end():].startswith('Encountered error in step execution:')),
                'result_id': row.get('tool_call_id') or row.get('tool_use_id'),
                'calls': [{'number': n, 'name': c.get('name'), 'id': c.get('id') or c.get('tool_call_id'),
                           'query': c.get('args', {}).get('query') if isinstance(c.get('args'), dict) else None,
                           'file_args': {k: c['args'].get(k) for k in ('AbsolutePath', 'StartLine', 'EndLine')} if c.get('name') == 'view_file' and isinstance(c.get('args'), dict) else None,
                           'preview': compact_line(as_text(c.get('args')), 420)}
                          for n, c in enumerate(row.get('tool_calls') or []) if isinstance(c, dict)]}

    def events(self, rows):
        events = []; lookup = {}; turn = 0; warnings = Counter()
        # A step may be rewritten as it completes; only its latest snapshot is visible.
        latest = {r['step']: (offset, line, r) for offset, line, r in rows}
        ordered = sorted(latest.values(), key=lambda v: v[2]['step'] if isinstance(v[2]['step'], int) else v[0])
        matched = {}; call_ids = {}; pending = None; previous_step = None
        for index, (offset, line, r) in enumerate(ordered):
            if r['type'] == 'USER_INPUT': call_ids.clear(); pending = None
            if r['type'] == 'PLANNER_RESPONSE': pending = r
            elif pending and (not isinstance(previous_step, int) or r['step'] != previous_step+1): pending = None
            for call in r['calls']:
                if call['id']: call_ids.setdefault(call['id'], []).append((r['step'], call['number']))
            candidates = call_ids.get(r['result_id'], []) if r['result_id'] and r['type'] in ('GENERIC', 'ERROR_MESSAGE') else []
            if not candidates and r['type'] == 'GENERIC' and pending and isinstance(previous_step, int) and r['step'] == previous_step+1:
                # Within a contiguous execution block, require a unique echoed
                # query OR file path and line range. Parallel order is irrelevant.
                for call in pending['calls']:
                    identity = (pending['step'], call['number'])
                    if identity in matched: continue
                    query_matches = call['name'] == 'search_web' and r['result_query'] is not None and call['query'] == r['result_query']
                    args, file = call['file_args'], r['result_file']
                    file_matches = bool(args and file and args['AbsolutePath'] == file['path'] and
                                        (args['StartLine'] or 1) == file['start'] and
                                        (args['EndLine'] is None or min(args['EndLine'], file['total']) == file['end']) and
                                        file['start'] <= file['end'] <= file['total'])
                    if query_matches or file_matches: candidates.append(identity)
            if len(candidates) == 1 and candidates[0] not in matched:
                matched[candidates[0]] = (offset, line, r)
            if r['type'] not in ('PLANNER_RESPONSE', 'GENERIC', 'ERROR_MESSAGE'): pending = None
            previous_step = r['step']
        result_aliases = {r['step']: f'S/{step}/C/{number}' for (step, number), (_, _, r) in matched.items()}
        for offset, line, r in ordered:
            kind = r['type']; step = str(r['step'])
            if kind == 'USER_INPUT': turn += 1
            visible = r['preview'] or r['error']
            status = {'DONE': 'completed', 'ERROR': 'error', 'RUNNING': 'running'}.get(r['status'], r['status'] or 'metadata')
            if r['execution_error']: status = 'error'
            if r['step'] in result_aliases:
                lookup['S/'+step] = ('message', {'alias': result_aliases[r['step']]})
                continue
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
                result = matched.get((r['step'], call['number']))
                output = {'offset': result[0], 'line': result[1], 'part': 'content'} if result else None
                result_meta = result[2] if result else {}
                events.append({'ref': ref, 'turn': max(1, turn), 'kind': 'tool', 'name': call['name'] or '工具',
                               'preview': call['preview'], 'timestamp': result_meta.get('execution_start') or r['timestamp'],
                               'status': ('error' if result_meta.get('error') or result_meta.get('execution_error') or result_meta.get('status') == 'ERROR' or result_meta.get('type') == 'ERROR_MESSAGE' else 'completed') if result else 'unmatched',
                               'line': line, 'turn_status': 'completed', 'duration_ms': elapsed(result_meta.get('execution_start'), result_meta.get('execution_end')),
                               'result_note': None if result else '原始记录没有可验证的结果关联，执行记录单独展示。'})
                lookup[ref] = ('call', {'offset': offset, 'line': line, 'call': call['number'], 'part': 'args', 'output': output})
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
