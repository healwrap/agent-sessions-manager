"""Historical tool definitions and content-addressed Harness attachments."""
import hashlib
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


def enrich_detail(store, key, result):
    data = store.session(key); event = result['event']; loc = data['lookup'][event['ref']][1]
    selected = loc.get('output') if result['part'] == 'output' else loc
    fields = {'source': str(store.raw_files[key]), 'attachments': attachments(blocks_at(store, data, selected)) if selected else []}
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
