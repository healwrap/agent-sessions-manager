"""Project durable Harness steps, tool lifecycles and prompt changes."""
from collections import Counter
from .codex import elapsed

# Administrative records have no trajectory row in Harness. Source stream deltas
# are session memory only; durable settlements carry their recorded timing.
ADMIN = {'session', 'session/title', 'turn/start', 'turn/end', 'step/start', 'step/end',
         'permission/preset', 'sandbox/mode', 'approval/policy', 'request/context',
         'agent/inbox/spliced', 'agent/inbox/enqueued', 'agent/inbox/dequeued',
         'session/title-llm-request', 'assistant/attempt', 'assistant/live-chunk', 'compaction/start'}
ADMIN.update({'model/selection', 'assistant/chunk', 'reasoning-chunks', 'text-chunks', 'tool-call-chunks',
              'command/run', 'command/done', 'todo/write', 'goal/change', 'subagent/descriptor',
              'approval/asked', 'approval/decided', 'llm/retry-started', 'web/deepseek-search-llm-request'})


def events(rows):
    ledger = []; lookup = {}; turns = {}; calls = {}; outputs = {}; starts = {}; boundaries = {}; current = 1
    header = None; tools_digest = None; system_seen = False; warnings = Counter(); active_step = None
    system_prompt = None; waiting_prompts = []
    first_times = {}; retries = {}; compactions = {}; request_numbers = {}; request_count = 0

    def add(r, offset, line, kind, name, preview, part='text', suffix=''):
        ref = 'E/'+str(r['seq'])+suffix
        event = {'ref': ref, 'turn': r.get('turn') or current, 'step': r.get('step'), 'kind': kind, 'name': name,
                 'preview': preview, 'timestamp': r['timestamp'], 'completed_at': r['timestamp'],
                 'status': 'pending' if kind in ('tool', 'subtool') else 'completed',
                 'line': line, 'duration_ms': None, 'phase': 'reasoning' if part == 'reasoning' else None,
                 'layer': '工具调用' if kind == 'subtool' else '助手消息' if kind in ('assistant', 'tool') else None}
        loc = {'offset': offset, 'line': line, 'part': part, 'text': preview, 'header': header}
        ledger.append(event); lookup[ref] = ('message' if kind in ('user', 'assistant') else 'call', loc)
        return event, loc

    for offset, line, r in rows:
        kind = r['type']
        if kind.startswith('tool/ptc-dispatch') and r.get('step') is None:
            r = {**r, 'turn': current, 'step': active_step}
        identity = (r.get('turn') or current, r.get('step'))
        if kind == 'turn/start':
            next_turn = r.get('turn') or current
            if next_turn != current and turns.get(current, {}).get('status') == 'in_progress': turns[current]['status'] = 'aborted'
            current = next_turn; active_step = None; turns[current] = {'status': 'in_progress'}
        elif kind == 'turn/end':
            reason = r.get('reason') or {}; reason = reason.get('kind') if isinstance(reason, dict) else reason
            state = 'completed' if reason == 'completed' else 'error' if reason == 'error' else 'aborted'
            turns[r.get('turn') or current] = {'status': state}
            boundaries[(r.get('turn') or current, None)] = r['timestamp']
        elif kind == 'step/start':
            starts[identity] = r['timestamp']; active_step = r['step']
            request_count += 1; request_numbers[identity] = request_count
        elif kind == 'step/end':
            boundaries[identity] = r['timestamp']; active_step = None
        elif kind == 'user/message':
            user = r['source_kind'] in (None, 'user')
            add(r, offset, line, 'user' if user else 'context', '用户' if user else '上下文', r['preview'] or (f"{r['image_count']} 张图片" if r['image_count'] else ''))
        elif kind == 'assistant/message':
            if identity not in request_numbers:
                request_count += 1; request_numbers[identity] = request_count
            # Harness renders one model cell, with thinking and output inside it.
            preview = r['preview'] or r['reasoning'] or ('（仅工具调用）' if r['has_tools'] else f"{r['image_count']} 张图片" if r['image_count'] else '')
            part = 'reasoning' if r['reasoning'] and not r['preview'] else 'text'
            event, loc = add(r, offset, line, 'assistant', '助手', preview, part, '/R' if part == 'reasoning' else '')
            loc['placeholder'] = preview if not r['preview'] and not r['reasoning'] else ''
            event.update(timestamp=starts.get(identity) or r['timestamp'], first_token_at=first_times.get(identity) or r['first_token_at'],
                         duration_ms=elapsed(starts.get(identity), r['timestamp']), usage=r['usage'],
                         model=r['model'], model_provider=r['model_provider'], request_number=request_numbers[identity])
            loc['retries'] = list(retries.get(identity, []))
            if r['has_tools'] and not r['preview'] and not r['reasoning']: event['phase'] = 'tool_calls'
            if r['interrupted']: event['status'] = 'aborted'
        elif kind in ('tool/call', 'tool/ptc-dispatch-start'):
            nested = kind != 'tool/call'
            event, loc = add(r, offset, line, 'subtool' if nested else 'tool', r['name'] or '工具', r['input'], 'dispatch_arguments' if nested else 'arguments')
            event['call_id'] = r['call_id']
            calls.setdefault((*identity, r['call_id']), []).append((event, loc))
            if nested: event.update(parent_call_id=r['parent_id'], root_call_id=r['root_id'])
        elif kind in ('tool/result', 'tool/ptc-dispatch'):
            for output in r['results']:
                loc = {'offset': offset, 'line': line, 'part': 'dispatch_result' if kind == 'tool/ptc-dispatch' else 'result', 'block': output['block']}
                outputs.setdefault((*identity, output['id']), []).append((loc, output, r))
        elif kind == 'system/message':
            _, loc = add(r, offset, line, 'context', '系统提示词', '系统提示词已更新' if system_seen else '初始系统提示词')
            loc['previous_system'] = system_prompt
            loc['previous_header'] = header
            loc['prompt_header'] = None
            waiting_prompts.append(loc)
            system_prompt = {'offset': offset, 'line': line}
            system_seen = True
        elif kind == 'request/header':
            # Header facts are shared until the next header, even across turns.
            if header is not None and tools_digest != r.get('tools_digest'):
                _, loc = add(r, offset, line, 'context', '工具定义', '工具已更新', 'header')
                loc.update(prompt_header={'offset': offset, 'line': line},
                           previous_header=header, prompt_system=system_prompt)
            for loc in waiting_prompts:
                loc['prompt_header'] = {'offset': offset, 'line': line}
            waiting_prompts.clear()
            tools_digest = r.get('tools_digest')
            header = {'offset': offset, 'line': line}
        elif kind == 'compaction/start':
            request_count += 1
            event, loc = add(r, offset, line, 'context', '上下文压缩', '正在压缩上下文')
            event['request_number'] = request_count
            event['status'] = 'running'
            loc['placeholder'] = event['preview']
            compactions[r.get('compaction_id')] = (event, loc)
        elif kind == 'compaction/summary':
            item = compactions.get(r.get('compaction_id'))
            if item:
                event, loc = item; loc.update(offset=offset, line=line, part='summary')
                event.update(preview=r['summary'], model=r['model'], usage=r['usage'])
        elif kind == 'compaction/end':
            item = compactions.get(r.get('compaction_id'))
            if item:
                event, loc = item
                event.update(status='error' if r.get('compaction_error') else 'completed', completed_at=r['timestamp'], duration_ms=elapsed(event['timestamp'], r['timestamp']))
            else: add(r, offset, line, 'context', '上下文压缩', '上下文已压缩，历史可见记录仍可查看')
        elif kind == 'assistant/attempt':
            if r['first_token_at']: first_times.setdefault(identity, r['first_token_at'])
        elif kind == 'llm/retry':
            retries.setdefault(identity, []).append({'offset': offset, 'line': line})
        elif kind not in ADMIN and not str(kind).startswith(('session-log-', 'session/')):
            warnings[kind] += 1
    for identity, results in outputs.items():
        matching = calls.get(identity, [])
        if identity[2] and len(matching) == len(results) == 1:
            event, loc = matching[0]; output, metadata, record = results[0]
            loc['output'] = output; event['status'] = 'error' if metadata['error'] else 'completed'
            event['output_chars'] = metadata['chars']; event['completed_at'] = record['timestamp']
            event['output_preview'] = (metadata.get('error_code') or 'error') if metadata['error'] else metadata['preview'] or (f"{metadata['image_count']} 张图片" if metadata.get('image_count') else '无输出')
            event['duration_ms'] = elapsed(event['timestamp'], record['timestamp'])
        else:
            for output, metadata, record in results:
                event, loc = add(record, output['offset'], output['line'], 'media', '执行结果', metadata['preview'], output['part'], '/'+str(metadata['block'] or 0))
                event['turn'] = identity[0]; event['status'] = 'error' if metadata['error'] else 'completed'; loc['block'] = metadata['block']
    for event in ledger:
        if event['kind'] in ('tool', 'subtool') and (event['turn'], event['step']) in request_numbers:
            event['request_number'] = request_numbers[(event['turn'], event['step'])]
        if event['kind'] in ('tool', 'subtool') and event['status'] == 'pending':
            end = boundaries.get((event['turn'], event['step'])) or boundaries.get((event['turn'], None))
            if end:
                event.update(status='aborted', completed_at=end, duration_ms=elapsed(event['timestamp'], end), output_preview='interrupted')
        if event['kind'] == 'subtool':
            roots = calls.get((event['turn'], event['step'], event.get('parent_call_id')), [])
            if len(roots) == 1 and roots[0][0] is not event: event['parent_ref'] = roots[0][0]['ref']
        event['turn_status'] = turns.get(event['turn'], {'status': 'in_progress'})['status']
    ledger.sort(key=lambda e: e['line'])
    cumulative_usage = {}
    for event in ledger:
        if event.get('request_number') is not None:
            if event['kind'] == 'assistant' or event['name'] == '上下文压缩':
                for name, value in (event.get('usage') or {}).items():
                    if isinstance(value, (int, float)) and not isinstance(value, bool):
                        cumulative_usage[name] = cumulative_usage.get(name, 0) + value
            event['request_cumulative_usage'] = dict(cumulative_usage)
    for number, state in turns.items():
        last = next((e for e in reversed(ledger) if e['turn'] == number and e['kind'] in ('tool', 'assistant')), None)
        if state['status'] == 'completed' and last and last['kind'] == 'assistant' and last['phase'] not in ('reasoning', 'tool_calls'): last['phase'] = 'final_answer'
    return ledger, lookup, [turns[n] for n in sorted(turns)], dict(warnings)
