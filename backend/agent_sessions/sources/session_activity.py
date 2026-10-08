"""Bounded activity summaries from normalized, independently stored sessions."""
from agent_sessions.context.text import compact_line


def session_activity(adapter, key):
    with adapter.lock:
        version = adapter.revision(key)
        cache = getattr(adapter, 'activity_cache', None)
        if cache is None:
            cache = adapter.activity_cache = {}
        previous = cache.get(key)
        if previous and previous[0] == version: return previous[1]
        loaded = key in adapter.loaded
        try:
            data = adapter.session(key)
            turns = data.get('turns') or []
            status = turns[-1].get('status', 'unknown') if turns else 'unknown'
            latest_turn = data['events'][-1]['turn'] if data['events'] else None
            replies = [event for event in data['events'] if event['kind'] == 'assistant' and event['turn'] == latest_turn
                       and event.get('phase') not in {'reasoning', 'tool_calls', 'analysis'}]
            final = [event for event in replies if event.get('phase') in {'final', 'final_answer'}]
            message = (final or replies)[-1] if final or replies else None
            task = next((event for event in reversed(data['events']) if event['kind'] == 'user'), None)
            # Indexed visible message text retains line breaks for the Markdown excerpt.
            record = data['lookup'][message['ref']][1] if message else {}
            result = record.get('text', message.get('preview', '')) if message else ''
            if not isinstance(result, str): result = message.get('preview', '') if message else ''
            summary = {'status': status,
                       'task_preview': compact_line(task.get('preview', ''), 160) if task else '',
                       'result_preview': result[:600].rstrip()+('…' if len(result) > 600 else ''),
                       'result_ref': message.get('ref') if message else None}
            cache[key] = (version, summary)
            return summary
        finally:
            if not loaded: adapter.loaded.pop(key, None)
