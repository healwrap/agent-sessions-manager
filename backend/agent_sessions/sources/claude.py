"""Claude Code JSONL adapter with native call IDs and branch ancestry."""
from __future__ import annotations
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from agent_sessions.context.text import compact_line
from .common import elapsed
from .base import HistoryStore, as_text
from .claude_detail import enrich_detail, attachment_bytes, message_text

DESKTOP_ENTRYPOINTS = ('claude-desktop', 'claude-desktop-3p')

class ClaudeStore(HistoryStore):
    def __init__(self, root):
        super().__init__(root, 'claude', 'local')
        self.desktop_keys = set()

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
            subagent = '/subagents/' in '/'+key
            parent = key.rsplit('/subagents/', 1)[0] if subagent else None
            relationship = {'session_kind': 'subagent', 'parent_id': parent if parent in self.files else None,
                            'agent_name': path.stem} if subagent else {}
            self.rows[key] = {'id': key, 'native_id': native, 'title': title or first or path.stem,
                              'cwd': cwd, 'updated_at': datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat(),
                              'is_subagent': subagent, **relationship,
                              'desktop_origin': any(r.get('entrypoint') in DESKTOP_ENTRYPOINTS for _, _, r in index['rows']),
                              **self.project(key, cwd)}
        self.rows = {k: v for k, v in self.rows.items() if k in self.files}
        return [row for row in self.rows.values() if row['id'] not in self.desktop_keys]

    def metadata(self, row):
        msg = row.get('message') or {}
        if not isinstance(msg, dict): msg = {}
        content = msg.get('content', []) if isinstance(msg, dict) else ''
        result = {'type': row.get('type'), 'uuid': row.get('uuid'), 'parent': row.get('parentUuid'),
                  'timestamp': row.get('timestamp'), 'cwd': row.get('cwd'), 'session_id': row.get('sessionId'),
                  'entrypoint': row.get('entrypoint'),
                  'title': row.get('customTitle'), 'subtype': row.get('subtype'), 'model': msg.get('model'),
                  'usage': {target: msg['usage'][native] for native, target in
                            [('input_tokens', 'inputTokens'), ('output_tokens', 'outputTokens'),
                             ('cache_read_input_tokens', 'cacheReadTokens'), ('cache_creation_input_tokens', 'cacheWriteTokens')]
                            if isinstance(msg.get('usage'), dict) and isinstance(msg['usage'].get(native), (int, float))},
                  'thinking': compact_line(message_text(content, 'thinking'), 420),
                  'images': sum(isinstance(b, dict) and b.get('type') == 'image' for b in content) if isinstance(content, list) else 0, 'leaf': row.get('leafUuid'), 'sidechain': row.get('isSidechain'),
                  'role': row.get('type'), 'preview': compact_line(as_text(content), 420), 'blocks': []}
        for number, block in enumerate(content if isinstance(content, list) else []):
            if not isinstance(block, dict):
                continue
            kind = block.get('type')
            if kind in ('tool_use', 'tool_result'):
                result['blocks'].append({'number': number, 'type': kind, 'id': block.get('id') or block.get('tool_use_id'),
                                         'name': block.get('name'), 'error': block.get('is_error', False),
                                         'preview': compact_line(as_text(block.get('input') if kind == 'tool_use' else block.get('content')), 420)})
        return result

    def events(self, rows):
        by_uuid = {r['uuid']: (o, n, r) for o, n, r in rows if r.get('uuid')}
        # Follow the current leaf, retaining native parent links instead of flattening forks.
        leaf = next((r.get('leaf') or r.get('uuid') for _, _, r in reversed(rows) if r.get('leaf') or r.get('uuid')), None)
        active = set(); cursor = leaf
        while cursor and cursor not in active:
            active.add(cursor); cursor = by_uuid.get(cursor, (0, 0, {}))[2].get('parent')
        events = []; lookup = {}; turn = 0; counts = Counter(); calls = {}; outputs = {}; warnings = Counter()
        def add(ref, kind, name, preview, r, loc, phase=None):
            counts[(turn, kind)] += 1
            event = {'ref': ref, 'turn': max(1, turn), 'kind': kind, 'name': name, 'preview': preview,
                     'timestamp': r.get('timestamp'), 'status': 'pending' if kind == 'tool' else 'completed',
                     'line': loc['line'], 'turn_status': 'completed', 'phase': phase,
                     'duration_ms': None, 'model': r.get('model'), 'usage': r.get('usage'),
                     'record_type': kind+'_message' if kind in ('user', 'assistant') else 'tool_call', 'native_id': r.get('uuid'), 'native_parent_id': r.get('parent')}
            events.append(event); lookup[ref] = ('message' if kind in ('user', 'assistant') else 'call', loc)
            if kind in ('user', 'assistant'): loc['text'] = preview
            return event
        for offset, line, r in rows:
            if r.get('uuid') and (r['uuid'] not in active or by_uuid[r['uuid']][0] != offset):
                continue
            if r['type'] not in ('user', 'assistant', 'system'):
                if r['type'] not in ('progress', 'file-history-snapshot', 'queue-operation', 'last-prompt', 'summary'):
                    warnings[r['type'] or 'unknown'] += 1
                continue
            if r['type'] == 'system':
                if r.get('subtype') == 'compact_boundary':
                    loc = {'offset': offset, 'line': line, 'part': 'compaction'}
                    event = add('B/'+str(line), 'context', '上下文压缩', '上下文已压缩，历史可见记录保留', r, loc)
                    event['record_type'] = 'compaction'
                continue
            visible = r['preview'] or r['thinking'] or (f"{r['images']} 张图片" if r['images'] else '')
            has_calls = any(b['type'] == 'tool_use' for b in r['blocks'])
            if not visible and r['type'] == 'assistant' and has_calls: visible = '（仅工具调用）'
            if r['type'] == 'user' and (r['preview'] or r['images']):
                turn += 1
            uid = r.get('uuid') or str(line)
            loc = {'offset': offset, 'line': line, 'part': 'text'}
            if visible:
                event = add('M/'+uid, r['type'], '用户' if r['type'] == 'user' else '助手', visible, r, loc)
                if r['type'] == 'assistant':
                    event['has_reasoning'] = bool(r['thinking'])
                    if not r['preview']:
                        event['phase'] = 'reasoning' if r['thinking'] else 'tool_calls' if has_calls else None
            for block in r['blocks']:
                location = {'offset': offset, 'line': line, 'block': block['number'], 'part': block['type']}
                if block['type'] == 'tool_use':
                    ref = 'C/'+uid+'/'+str(block['number'])
                    event = add(ref, 'tool', block['name'] or '工具', block['preview'], r, location)
                    event.update(tool_call_id=block['id'], parent_ref='M/'+uid if visible else None)
                    calls.setdefault(block['id'], []).append((event, location, r))
                else:
                    outputs.setdefault(block['id'], []).append((location, block, {**r, 'visible_turn': max(1, turn)}))
        for key, matching in calls.items():
            results = outputs.get(key, [])
            if key and len(matching) == 1 and len(results) == 1:
                event, location, call = matching[0]; output, result, record = results[0]
                location['output'] = output
                event['status'] = 'error' if result['error'] else 'completed'
                event['duration_ms'] = elapsed(call.get('timestamp'), record.get('timestamp'))
                event['completed_at'] = record.get('timestamp')
                event['output_preview'] = result['preview'] or '无输出'
            else:
                for output, result, record in results:
                    event = add('O/'+str(output['line'])+'/'+str(output['block']), 'context', '执行结果', result['preview'], record, output)
                    event.update(turn=record.get('visible_turn', max(1, turn)), record_type='execution_result', status='error' if result['error'] else 'completed')
        for key, results in outputs.items():
            if key in calls: continue
            for output, result, record in results:
                event = add('O/'+str(output['line'])+'/'+str(output['block']), 'context', '执行结果', result['preview'], record, output)
                event.update(turn=record.get('visible_turn', max(1, turn)), record_type='execution_result', status='error' if result['error'] else 'completed')
        events.sort(key=lambda e: e['line'])
        turns = [{'status': 'completed'} for _ in range(max(1, turn))]
        # Explicitly show the final visible assistant text in each completed turn.
        for number in range(1, max(1, turn)+1):
            last = next((e for e in reversed(events) if e['turn'] == number), None)
            if last and last['kind'] == 'assistant': last['phase'] = 'final_answer'
            elif last:
                turns[number-1]['status'] = 'in_progress'
                for e in events:
                    if e['turn'] == number: e['turn_status'] = 'in_progress'
        return events, lookup, turns, dict(warnings)

    def body(self, row, location):
        if location.get('part') == 'compaction': return json.dumps(row, ensure_ascii=False, indent=2)
        content = (row.get('message') or {}).get('content', '')
        if 'block' not in location:
            if row.get('type') == 'assistant':
                return '\n\n'.join(filter(None, [message_text(content, 'thinking'), as_text(content)]))
            return as_text(content)
        block = content[location['block']]
        return as_text(block.get('input') if location['part'] == 'tool_use' else block.get('content'))

    def detail(self, key, ref, page=1, part='input'):
        with self.lock:
            return enrich_detail(self, key, super().detail(key, ref, page, part))

    def attachment(self, key, ref, index, part='output'):
        return attachment_bytes(self, key, ref, index, part)


class ClaudeDesktopStore(ClaudeStore):
    """Desktop index or explicit transcript origin identifies shared histories."""
    def __init__(self, root, transcripts):
        super().__init__(root)
        self.instance = 'desktop'
        self.transcripts = transcripts.expanduser().resolve()
        self.shared = ClaudeStore(self.transcripts)

    def available(self):
        return self.root.is_dir() or (self.transcripts/'projects').is_dir()

    def discover(self):
        files = {}; rows = {}
        paths = list(self.root.glob('*/*/*.json')) + list(self.root.glob('*.json'))
        by_id = {}
        with self.shared.lock:
            self.shared.discover()
            shared_rows = list(self.shared.rows.values())
            shared_files = dict(self.shared.files)
        for transcript in shared_files.values():
            by_id.setdefault(transcript.stem, []).append(transcript)
        represented = set()
        for path in paths:
            if path.stat().st_size > 10*1024*1024: continue
            try: item = json.loads(path.read_text(encoding='utf-8'))
            except (ValueError, OSError): continue
            if not isinstance(item, dict) or not isinstance(item.get('sessionId'), str) or not isinstance(item.get('cwd'), str): continue
            key = str(path.relative_to(self.root)).removesuffix('.json')
            native = item.get('cliSessionId') or item.get('unarchivedCliSessionId')
            matches = by_id.get(native, [])
            direct = self.transcripts/'projects'/re.sub(r'[^a-zA-Z0-9]', '-', item['cwd'])/(str(native)+'.jsonl')
            transcript = direct if direct in matches else matches[0] if len(matches) == 1 else None
            if transcript is None and isinstance(item.get('stagedTranscriptPath'), str):
                staged = Path(item['stagedTranscriptPath'])
                if staged.parent.resolve() == (path.parent/'imported-staging').resolve() and staged.is_file():
                    transcript = staged
            if transcript: represented.add(transcript)
            files[key] = transcript or path
            cwd = item.get('originCwd') or item['cwd']
            title = item.get('title') or item.get('name') or '(无标题)'
            updated = item.get('lastActivityAt') or item.get('updatedAt') or path.stat().st_mtime*1000
            if isinstance(updated, (int, float)): updated = datetime.fromtimestamp(updated/1000).astimezone().isoformat()
            rows[key] = {'id': key, 'native_id': native or item['sessionId'], 'title': title, 'cwd': cwd,
                         'updated_at': str(updated), 'transcript_available': transcript is not None,
                         'transcript_key': str(transcript.relative_to(self.transcripts/'projects')).removesuffix('.jsonl')
                         if transcript and transcript.is_relative_to(self.transcripts/'projects') else None,
                         'unavailable_reason': '找到多份同 ID 正文，且无法确认桌面会话目录。' if len(matches) > 1 and transcript is None else None,
                         **self.project(key, cwd)}
        for row in shared_rows:
            transcript = shared_files[row['id']]
            if not row['desktop_origin'] or transcript in represented: continue
            key = 'transcript/'+row['id']
            files[key] = transcript
            rows[key] = {**row, 'id': key, 'transcript_key': row['id'],
                         'transcript_available': True, 'unavailable_reason': None}
        self.files, self.rows = files, rows
        return list(rows.values())

    def session(self, key):
        with self.lock:
            self.discover()
            row = self.rows.get(key)
            # Preserve a marker-based link after an independent desktop index appears.
            if row is None and key.startswith('transcript/'):
                relative = key.removeprefix('transcript/')
                with self.shared.lock:
                    if self.shared.rows.get(relative, {}).get('desktop_origin'):
                        return self.shared.session(relative)
            if row and not row['transcript_available']:
                stat = self.files[key].stat()
                return {'source': self.files[key], 'events': [], 'lookup': {}, 'turns': [],
                        'index': {'meta': {'title': row['title'], 'cwd': row['cwd']},
                                  'source_size': stat.st_size, 'source_mtime_ns': stat.st_mtime_ns}}
            return super().session(key)
