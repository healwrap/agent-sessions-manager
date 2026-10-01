"""Claude Code JSONL adapter with native call IDs and branch ancestry."""
from __future__ import annotations
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from agent_sessions.context.text import compact_line
from .codex import elapsed
from .base import HistoryStore, as_text

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
