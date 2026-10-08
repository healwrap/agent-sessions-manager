"""Provider-independent trajectory projection, search and recorded time."""
from __future__ import annotations
import math
from datetime import datetime
from agent_sessions.trajectory.layout import layout, focus as layout_focus
from .tool_summary import argument_summary
from .revision import file_revision

PAGE_CHARS = 7000


def assistant_page(thinking, output, page):
    """Project each visible content part onto the unchanged record page range."""
    start = (page-1)*PAGE_CHARS; end = page*PAGE_CHARS
    shift = len(thinking)+2 if thinking and output else 0
    return {'thinking_text': thinking[start:end],
            'thinking_pages': (len(thinking)+PAGE_CHARS-1)//PAGE_CHARS,
            'output_text': output[max(0, start-shift):max(0, end-shift)],
            'output_page': shift//PAGE_CHARS+1 if output else None}


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
    if event['kind'] in ('tool', 'subtool') and not event.get('argument_summary'):
        summary = argument_summary(event['preview'])
        if summary: event['argument_summary'] = summary
    return event


class TrajectoryStore:
    """Shared services operate on normalized ledgers; subclasses parse native data."""
    def available(self):
        return self.root.is_dir()

    def session_activity(self, key):
        from .session_activity import session_activity
        return session_activity(self, key)

    def revision(self, key):
        with self.lock:
            path = self.files.get(key)
            if path is None or not path.is_file():
                self.discover()
                path = self.files.get(key)
            if path is None:
                if key not in self.rows: raise FileNotFoundError('没有找到该来源的会话记录')
                # An index-only conversation may later acquire a transcript.
                return str(self.rows[key].get('updated_at', ''))
            return file_revision([path])

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
            matched_refs = {e['ref'] for e in selected}
            matched_refs.update(e['parent_ref'] for e in selected if e.get('parent_ref'))
            # Keep request boundaries for the table, but mark them explicitly so
            # they never become assistant spans. Every visible record is exact.
            fields = ('position', 'timeline_position', 'kind', 'ref', 'name', 'record_type',
                      'request_number', 'request_only', 'turn', 'timestamp', 'status',
                      'first_token_at', 'completed_at', 'duration_ms', 'timeline_start', 'timeline_end')
            overview = [{**{field: event[field] for field in fields if field in event},
                         'search_match': event['ref'] in matched_refs,
                         'count': 1, 'end_position': event['position']}
                        for event in events]
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
