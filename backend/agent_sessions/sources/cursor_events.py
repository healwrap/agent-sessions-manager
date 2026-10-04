"""Map visible Cursor bubbles to stable message and tool references."""
from collections import Counter
from agent_sessions.context.text import compact_line
from .cursor_storage import bubble, timestamp


def events(db, table, status, locations, initial_warnings):
    visible = []; lookup = {}; turn = 0; warnings = Counter(initial_warnings)
    for location in locations:
        grouping = location['header'].get('grouping') or {}
        if isinstance(grouping, dict) and grouping.get('isRenderable') is False: continue
        record = bubble(db, table, location)
        if record is None:
            warnings['cursor_missing_bubbles'] += 1
            continue
        if record['isSimulatedMsg']: continue
        role = record['type']
        # Never project thinking, system context or attached code as messages.
        if role not in (1, 2):
            warnings['cursor_unknown_bubble_type'] += 1
            continue
        if role == 1: turn += 1
        kind = 'tool' if role == 2 and record['toolFormerData.name'] else 'user' if role == 1 else 'assistant'
        text = record['args'] if kind == 'tool' else record['text']
        if not text and kind != 'tool' and not record['media_count']: continue
        uid = location['bubble_id']
        ref = ('C/' if kind == 'tool' else 'M/')+uid
        if ref in lookup:
            warnings['cursor_duplicate_bubble_ids'] += 1
            continue
        state = record['toolFormerData.status'] if kind == 'tool' else 'completed'
        if record['isCanceled'] or record['isCancelled']: state = 'aborted'
        state = {'cancelled': 'aborted', 'canceled': 'aborted', 'failed': 'error', 'generating': 'running', 'loading': 'running'}.get(state, state or 'pending')
        event = {'ref': ref, 'turn': max(1, turn), 'kind': kind,
                 'name': record['toolFormerData.name'] if kind == 'tool' else '用户' if kind == 'user' else '助手',
                 'preview': compact_line(text or '媒体附件', 420),
                 'timestamp': timestamp(record['createdAt'] or location['header'].get('createdAt')),
                 'status': state, 'line': None, 'native_id': uid, 'tool_call_id': record['toolFormerData.toolCallId'],
                 'duration_ms': None, 'turn_status': 'completed', 'phase': None, 'position': len(visible)}
        visible.append(event)
        lookup[ref] = ('call' if kind == 'tool' else 'message', {**location, 'kind': kind, 'text': record['text'], 'output_available': record['output_available'] if kind == 'tool' else False})
    final = {'generating': 'in_progress', 'running': 'in_progress', 'streaming': 'in_progress', 'in_progress': 'in_progress',
             'cancelled': 'aborted', 'canceled': 'aborted', 'aborted': 'aborted', 'failed': 'error', 'error': 'error'}.get(status, 'completed')
    if visible and visible[-1]['kind'] == 'user' and final == 'completed': final = 'in_progress'
    turns = [{'status': final if number == max(1, turn) else 'completed'} for number in range(1, max(1, turn)+1)] if visible else []
    for event in visible:
        if event['turn'] == max(1, turn): event['turn_status'] = final
    return visible, lookup, turns, dict(warnings)
