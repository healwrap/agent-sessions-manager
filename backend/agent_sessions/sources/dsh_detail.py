"""Historical tool definitions and content-addressed Harness attachments."""
import hashlib
import json
import re
from .base import read_row, as_text
from agent_sessions.context.text import compact_line
from .dsh_metadata import content

IMAGE_TYPES = {'image/png', 'image/jpeg', 'image/webp', 'image/gif'}


def blocks_at(store, data, location):
    row = read_row(data['source'], location['offset']); message = row.get('data', {}).get('message', row.get('data', {}))
    blocks = message.get('content', [])
    if location.get('block') is not None: blocks = blocks[location['block']].get('content', [])
    return blocks if isinstance(blocks, list) else []


def attachments(blocks):
    return [{'index': i, **block['attachment']} for i, block in enumerate(blocks)
            if isinstance(block, dict) and block.get('type') in ('image', 'file') and isinstance(block.get('attachment'), dict)]


def tool_shortcuts(data, event, blocks):
    shortcuts = []
    for block in blocks:
        if not isinstance(block, dict) or block.get('type') != 'tool-call': continue
        matches = [e for e in data['events'] if e['kind'] == 'tool' and block.get('id') and
                   e.get('call_id') == block['id'] and e.get('name') == block.get('name') and
                   (e['turn'], e.get('step')) == (event['turn'], event.get('step'))]
        shortcuts.append({'ref': matches[0]['ref'] if len(matches) == 1 else None,
                          'name': block.get('name') or '工具', 'preview': compact_line(as_text(block.get('arguments')), 420)})
    return shortcuts


def source_blocks(blocks, shortcuts=()):
    """Keep the source block order used by the native raw-content inspector."""
    result = []; call_index = 0
    for block in blocks:
        if not isinstance(block, dict):
            result.append({'type': 'unknown', 'content': json.dumps(block, ensure_ascii=False, indent=2)})
            continue
        kind = block.get('type', 'unknown')
        if kind in ('text', 'reasoning') and isinstance(block.get('text'), str):
            result.append({'type': 'thinking' if kind == 'reasoning' else kind, 'content': block['text']})
        elif kind == 'tool-call':
            args = block.get('arguments', '')
            shortcut = shortcuts[call_index] if call_index < len(shortcuts) else None
            call_index += 1
            result.append({'type': kind, 'content': args if isinstance(args, str) else json.dumps(args, ensure_ascii=False, indent=2),
                           'ref': shortcut.get('ref') if shortcut else None})
        else:
            entry = {'type': kind, 'content': json.dumps(block, ensure_ascii=False, indent=2)}
            if kind in ('image', 'file') and isinstance(block.get('attachment'), dict):
                entry['attachment'] = block['attachment']
            result.append(entry)
    return result


def prompt_snapshot(source, system, header):
    prompt = ''
    if system:
        row = read_row(source, system['offset'])
        message = row.get('data', {}).get('message', {})
        prompt = content(message.get('content', []), 'text')
    tools = None
    if header:
        row = read_row(source, header['offset'])
        tools = row.get('data', {}).get('header', {}).get('tools', [])
    return {'system': prompt, 'tools': tools}


def enrich_detail(store, key, result):
    data = store.session(key); event = result['event']; loc = data['lookup'][event['ref']][1]
    selected = loc.get('output') if result['part'] == 'output' else loc
    fields = {'source': str(store.raw_files[key]), 'attachments': attachments(blocks_at(store, data, selected)) if selected else []}
    if event['kind'] in ('user', 'assistant', 'context'):
        row = read_row(data['source'], loc['offset'])
        payload = row.get('data', {})
        message = payload.get('message', payload)
        if isinstance(message, dict) and 'source' in message:
            fields['message_source'] = message['source']
    if event['name'] in ('系统提示词', '工具定义'):
        system = loc if event['name'] == '系统提示词' else loc.get('prompt_system')
        fields['prompt_snapshot'] = prompt_snapshot(data['source'], system, loc.get('prompt_header'))
        previous_system = loc.get('previous_system', system)
        previous_header = loc.get('previous_header')
        if previous_system or previous_header:
            fields['previous_prompt_snapshot'] = prompt_snapshot(data['source'], previous_system, previous_header)
    # Select the header effective when the operation started, never today's tools.
    header = loc.get('header')
    if header:
        request = read_row(data['source'], header['offset']).get('data', {}).get('header', {})
        fields['request_config'] = request.get('config')
        if event['kind'] in ('tool', 'subtool'):
            definitions = [t for t in request.get('tools', []) if t.get('name') == event['name']]
            if len(definitions) == 1: fields['tool_schema'] = definitions[0]
    if event['kind'] in ('tool', 'subtool'):
        fields['output_preview'] = event.get('output_preview')
        fields['nested'] = [e for e in data['events'] if e.get('parent_ref') == event['ref']]
        parent = event.get('parent_ref')
        if not parent:
            assistant = next((item for item in reversed(data['events']) if item['kind'] == 'assistant' and
                              (item['turn'], item.get('step')) == (event['turn'], event.get('step')) and
                              item['line'] <= event['line']), None)
            parent = assistant['ref'] if assistant else None
        fields['hierarchy_parent_ref'] = parent
    if event.get('request_number') is not None:
        related = [item for item in data['events'] if (item['turn'], item.get('step')) ==
                   (event['turn'], event.get('step'))]
        fields['request_tool_calls'] = sum(item['kind'] == 'tool' for item in related)
        fields['request_subtool_calls'] = sum(item['kind'] == 'subtool' for item in related)
        assistant_result = next((item for item in related if item['kind'] == 'assistant'), None)
        fields['request_result_ref'] = event['ref'] if event['name'] == '上下文压缩' else assistant_result['ref'] if assistant_result else None
        if loc.get('retries'):
            retry = read_row(data['source'], loc['retries'][-1]['offset']).get('data', {})
            failure = retry.get('failure') or {}
            fields['request_retry'] = retry.get('retry')
            fields['request_max_retries'] = retry.get('maxRetries') if retry.get('mode') == 'normal' else None
            fields['request_retry_delay_ms'] = retry.get('delayMs')
            fields['request_error'] = failure.get('message') if isinstance(failure, dict) else str(failure)
            fields['request_error_code'] = failure.get('code') if isinstance(failure, dict) else None
    if event['kind'] == 'assistant':
        blocks = blocks_at(store, data, loc)
        fields['tool_calls'] = tool_shortcuts(data, event, blocks)
        # Separate disclosures preserve original text without creating two rail cells.
        thinking = content(blocks, 'reasoning'); output = content(blocks, 'text')
        start = (result['page']-1)*7000; end = result['page']*7000
        fields['thinking_text'] = thinking[start:end]
        output_start = len(thinking)+2 if thinking and output else 0
        fields['output_text'] = output[max(0, start-output_start):max(0, end-output_start)]
        fields['retries'] = [read_row(data['source'], r['offset']).get('data', {}) for r in loc.get('retries', [])]
    if result['part'] == 'raw' and event['kind'] in ('user', 'assistant', 'context'):
        blocks = blocks_at(store, data, loc)
        if blocks:
            fields['source_blocks'] = source_blocks(blocks, fields.get('tool_calls', ()))
            fields['pages'] = 1
    return {**result, **fields}


def attachment_bytes(store, key, ref, index, part):
    with store.lock:
        data = store.session(key)
        if ref not in data['lookup']: raise FileNotFoundError('事件不存在')
        record = data['lookup'][ref][1]; location = record.get('output') if part == 'output' else record
        if not location: raise FileNotFoundError('此事件没有附件')
        entries = attachments(blocks_at(store, data, location))
        entry = next((a for a in entries if a['index'] == index), None)
        if not entry or entry.get('mediaType') not in IMAGE_TYPES: raise FileNotFoundError('图片附件不存在')
        match = re.fullmatch(r'sha256:([a-f0-9]{64})', entry.get('attachmentId', ''))
        if not match: raise FileNotFoundError('图片附件引用无效')
        digest = match[1]; directory = (store.root/'attachments/v1/objects').resolve()
        path = (directory/digest[:2]/digest).resolve()
        if not path.is_relative_to(directory) or not path.is_file(): raise FileNotFoundError('原始图片附件已不存在')
        if path.stat().st_size > 20*1024*1024: raise ValueError('图片超过预览大小限制')
        body = path.read_bytes()
        if hashlib.sha256(body).hexdigest() != digest: raise ValueError('图片附件内容与引用不一致')
        return body, entry['mediaType']
