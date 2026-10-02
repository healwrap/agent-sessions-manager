"""Compact DSH facts; keep source bodies and tool schemas lazy."""
# Stream timing adapted from DeepSeek Harness (MIT), see harness-license.txt.
from datetime import datetime, timezone
from agent_sessions.context.text import compact_line
from .base import as_text
import hashlib
import json


def recorded_time(value):
    return datetime.fromtimestamp(value/1000, timezone.utc).isoformat() if isinstance(value, (int, float)) else None


def content(blocks, kind):
    if isinstance(blocks, str): return blocks if kind == 'text' else ''
    return '\n'.join(str(b.get('text', '')) for b in (blocks or []) if isinstance(b, dict) and b.get('type') == kind)


def first_token(stream):
    # Same token predicate and packed-run reconstruction as Harness assistant-stream.
    for run in stream or []:
        if run.get('type') == 'chunk':
            c = run.get('chunk', {}); kind = c.get('type')
            if kind in ('text-delta', 'reasoning-delta') and c.get('text') or kind == 'tool-call-delta' and (c.get('argumentsDelta') or c.get('name') is not None):
                return recorded_time(run.get('time'))
        elif run.get('type') in ('text-chunks', 'reasoning-chunks', 'tool-call-chunks'):
            if run['type'] == 'tool-call-chunks' and run.get('name') is not None: return recorded_time(run.get('time0'))
            time = run.get('time0'); fragments = run.get('args', run.get('texts', []))
            for i, fragment in enumerate(fragments):
                if i and time is not None: time += run.get('dt', [])[i-1]
                if fragment: return recorded_time(time)
    return None


def metadata(row):
    data = row.get('data') or {}; kind = row.get('type'); message = data.get('message', data)
    blocks = message.get('content', []); source = message.get('source') or {}
    if not isinstance(source, dict): source = {}
    types = [b.get('type') for b in blocks if isinstance(b, dict)] if isinstance(blocks, list) else []
    result = {'type': kind, 'seq': row.get('seq'), 'turn': data.get('turn'), 'step': data.get('step'),
              'timestamp': recorded_time(row.get('time')), 'source_kind': source.get('kind'),
              'preview': compact_line(as_text(blocks), 420), 'reasoning': compact_line(content(blocks, 'reasoning'), 420),
              'name': data.get('name'), 'call_id': data.get('callId'), 'input': compact_line(str(data.get('arguments', '')), 420),
              'results': [], 'reason': data.get('reason'), 'title': data.get('title'),
              'has_tools': 'tool-call' in types, 'image_count': types.count('image'),
              'interrupted': data.get('interrupted', False), 'first_token_at': first_token(data.get('stream')),
              'usage': data.get('usage'), 'model': source.get('model'), 'model_provider': source.get('provider')}
    if kind.startswith('compaction/'):
        result.update(compaction_id=data.get('compactionId'), compaction_error=data.get('error'),
                      summary=compact_line(as_text(data.get('summary')), 420), model=data.get('model'))
    if kind == 'tool/result':
        call_id = message.get('toolCallId') or source.get('callId')
        if call_id:
            result['results'].append({'id': call_id, 'error': bool(message.get('isError')), 'block': None,
                                      'preview': compact_line(as_text(blocks), 420), 'chars': len(as_text(blocks)),
                                      'image_count': types.count('image'), 'error_code': (data.get('error') or {}).get('code')})
        else:
            result['results'] = [{'id': b.get('toolCallId'), 'error': bool(b.get('isError')), 'block': i,
                                  'preview': compact_line(as_text(b.get('content')), 420), 'chars': len(as_text(b.get('content')))}
                                 for i, b in enumerate(blocks) if isinstance(b, dict) and b.get('type') == 'tool-result']
    if kind in ('tool/ptc-dispatch-start', 'tool/ptc-dispatch'):
        result.update(call_id=data.get('subCallId'), parent_id=data.get('parentCallId'), root_id=data.get('rootCallId'),
                      input=compact_line(json.dumps(data.get('arguments'), ensure_ascii=False), 420))
        if kind == 'tool/ptc-dispatch':
            result['results'] = [{'id': data.get('subCallId'), 'error': bool(data.get('isError')), 'block': None,
                                  'preview': compact_line(as_text(data.get('content', [])), 420),
                                  'chars': len(as_text(data.get('content', [])))}]
    if kind == 'request/header':
        result['tools_digest'] = hashlib.sha256(json.dumps(data.get('header', {}).get('tools', []), sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return result
