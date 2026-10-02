"""Provider-independent trajectory projection, search and recorded time."""
from __future__ import annotations
import math
from datetime import datetime
from agent_sessions.trajectory.layout import layout, focus as layout_focus

PAGE_CHARS = 7000


def elapsed(start, end):
    try:
        return max(0, round((datetime.fromisoformat(end.replace('Z', '+00:00')) -
                            datetime.fromisoformat(start.replace('Z', '+00:00'))).total_seconds() * 1000))
    except (ValueError, TypeError, AttributeError):
        return None


def timestamp_ms(value):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp() * 1000
    except (ValueError, TypeError, AttributeError):
        return None


def timeline_bounds(events):
    times = [t for e in events if e['kind'] != 'subtool'
             if (t := timestamp_ms(e.get('timestamp'))) is not None]
    return [min(times), max(times)] if times else None


def record_type(event):
    return event.get('record_type') or {
        '系统提示词': 'system_prompt', '工具定义': 'tool_definitions',
        '上下文压缩': 'compaction', '执行记录': 'execution_result', '执行结果': 'execution_result',
    }.get(event['name']) or {
        'user': 'user_message', 'assistant': 'assistant_message', 'tool': 'tool_call',
        'subtool': 'subtool_call', 'context': 'context_message', 'media': 'attachment',
    }.get(event['kind'], 'context_message')


def normalize_event(event):
    event['record_type'] = record_type(event)
    return event


class TrajectoryStore:
    """Shared services operate on normalized ledgers; subclasses parse native data."""
    full_overview = True

    def available(self):
        return self.root.is_dir()

    def attachment(self, key, ref, index, part='output'):
        raise FileNotFoundError('此来源没有可预览的附件')

    def message_search_text(self, data, record):
        return record.get('text', '')

    def matches_content(self, key, query):
        """Search visible dialogue only; keep just a versioned boolean cache."""
        with self.lock:
            path = self.files.get(key)
            if path is None: return False
            stat = path.stat()
            version = (stat.st_size, stat.st_mtime_ns, query.casefold())
            cached = self.search_matches.get(key)
            if cached and cached[0] == version: return cached[1]
            already_loaded = key in self.loaded
            try:
                data = self.session(key)
                result = any(query.casefold() in self.message_search_text(data, data['lookup'][e['ref']][1]).casefold()
                             for e in data['events'] if e['kind'] in ('user', 'assistant'))
                self.search_matches[key] = (version, result)
                return result
            finally:
                # Searching hundreds of sessions must not retain all their bodies.
                if not already_loaded: self.loaded.pop(key, None)

    def trajectory(self, key, offset=0, limit=150, query='', kind='all'):
        with self.lock:
            data = self.session(key)
            events = [normalize_event(e) for e in data['events']]
            timeline = layout(events)
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
                    label += ' '+self.trajectory_search_text(data, event, record_type, record)
                    if query.casefold() in label.casefold():
                        selected.append(event)
            overview = []
            matched_refs = {e['ref'] for e in selected}
            matched_refs.update(e['parent_ref'] for e in selected if e.get('parent_ref'))
            stride = 1 if getattr(self, 'full_overview', False) else max(1, (len(events)+249)//250)
            for start in range(0, len(events), stride):
                chunk = events[start:start+stride]
                for category in ('user', 'assistant', 'tool', 'media', 'context', *(['subtool'] if getattr(self, 'full_overview', False) else [])):
                    members = [e for e in chunk if e['kind'] == category]
                    if members:
                        overview.append({'position': members[0]['position'], 'kind': category, 'ref': members[0]['ref'], 'name': members[0]['name'],
                                         'end_position': members[-1]['position'], 'record_type': members[0]['record_type'],
                                         'request_number': members[0].get('request_number'),
                                         'search_match': any(e['ref'] in matched_refs for e in members),
                                         'count': len(members), 'turn': members[0]['turn'],
                                         'timestamp': members[0]['timestamp'], 'status': members[0]['status'],
                                         'first_token_at': members[0].get('first_token_at'), 'completed_at': members[0].get('completed_at'),
                                         'duration_ms': members[0].get('duration_ms'),
                                         'timeline_start': min(e['timeline_start'] for e in members),
                                         'timeline_end': max(e['timeline_end'] for e in members)})
            meta = data['index']['meta']
            return {'id': key, 'title': meta.get('title') or '(无标题)', 'cwd': meta.get('cwd'),
                    **self.project(key, meta.get('cwd')),
                    'events': selected[offset:offset+limit], 'total': len(selected), 'event_count': len(events),
                    'next_offset': offset+limit if offset+limit < len(selected) else None,
                    'turn_count': len(data['turns']), 'tool_count': sum(e['kind'] == 'tool' for e in events),
                    'current_status': data['turns'][-1]['status'] if data['turns'] else 'completed',
                    'overview': overview, 'compactions': meta.get('compactions', 0),
                    'time_bounds': timeline_bounds(events), **timeline,
                    'warnings': meta.get('unrecognized_record_types') or {},
                    'source_size': data['index'].get('source_size', 0),
                    'version': data['index'].get('source_mtime_ns')}

    def trajectory_search_text(self, data, event, record_type, record):
        return record.get('text', '') if record_type == 'message' else ''

    def focus(self, key, start, end, mode='position'):
        """Resolve against the full ledger, without reading message/tool bodies."""
        if not all(math.isfinite(x) and 0 <= x <= 1 for x in (start, end)) or mode not in {'position', 'duration'}:
            raise ValueError('时间线范围无效')
        start, end = sorted((start, end))
        with self.lock:
            events = self.session(key)['events']
            return layout_focus(events, start, end, mode)

