"""Translate recorded Claude content to the shared detail/attachment contract."""
import base64
import hashlib
import json
from .base import as_text, read_row
from .common import PAGE_CHARS
from agent_sessions.context.text import compact_line


def message_text(blocks, kind):
    if not isinstance(blocks, list): return ''
    return '\n'.join(b.get(kind, '') for b in blocks if isinstance(b, dict)
                     and b.get('type') == kind and isinstance(b.get(kind), str))


def blocks_at(data, location):
    if not location: return []
    row = read_row(data['source'], location['offset'])
    blocks = (row.get('message') or {}).get('content', [])
    if 'block' in location: blocks = blocks[location['block']].get('content', [])
    return blocks if isinstance(blocks, list) else []


def image_bytes(block):
    source = block.get('source', {})
    if block.get('type') != 'image' or source.get('type') != 'base64': return None
    mime = source.get('media_type')
    if mime not in ('image/png', 'image/jpeg', 'image/webp', 'image/gif'): return None
    encoded = source.get('data')
    if not isinstance(encoded, str) or len(encoded) > 28*1024*1024: return None
    try: return base64.b64decode(encoded, validate=True), mime
    except ValueError: return None


def attachments(blocks):
    result = []
    for index, block in enumerate(blocks):
        if not isinstance(block, dict): continue
        image = image_bytes(block)
        if image:
            content, mime = image
            result.append({'index': index, 'attachmentId': 'sha256:'+hashlib.sha256(content).hexdigest(),
                           'mediaType': mime, 'bytes': len(content)})
    return result


def enrich_detail(store, key, result):
    data = store.session(key); event = result['event']; loc = data['lookup'][event['ref']][1]
    location = loc.get('output') if result['part'] == 'output' else loc
    blocks = blocks_at(data, location)
    fields = {'attachments': attachments(blocks)}
    if event['kind'] == 'assistant':
        thinking = message_text(blocks, 'thinking'); output = as_text(blocks)
        start = (result['page']-1)*PAGE_CHARS; end = result['page']*PAGE_CHARS
        shift = len(thinking)+2 if thinking and output else 0
        fields.update(thinking_text=thinking[start:end],
                      output_text=output[max(0, start-shift):max(0, end-shift)])
        fields['tool_calls'] = [{'ref': e['ref'], 'name': e['name'], 'preview': e['preview']}
                               for e in data['events'] if e['kind'] == 'tool' and e.get('parent_ref') == event['ref']]
    if result['part'] == 'raw' and event['kind'] in ('user', 'assistant', 'context') and blocks:
        raw = []
        for block in blocks:
            if not isinstance(block, dict):
                raw.append({'type': 'unknown', 'content': json.dumps(block, ensure_ascii=False)})
                continue
            kind = block.get('type', 'unknown')
            if kind in ('text', 'thinking'):
                raw.append({'type': kind, 'content': block.get('text' if kind == 'text' else 'thinking', '')})
            elif kind == 'tool_use':
                matches = [e for e in data['events'] if e.get('parent_ref') == event['ref'] and e.get('tool_call_id') == block.get('id')]
                raw.append({'type': 'tool-call', 'content': as_text(block.get('input')),
                            'ref': matches[0]['ref'] if len(matches) == 1 else None})
            else:
                raw.append({'type': kind, 'content': json.dumps(block, ensure_ascii=False, indent=2)})
        fields.update(source_blocks=raw, pages=1)
    return {**result, **fields}


def attachment_bytes(store, key, ref, index, part):
    with store.lock:
        data = store.session(key)
        if ref not in data['lookup']: raise FileNotFoundError('事件不存在')
        loc = data['lookup'][ref][1]
        blocks = blocks_at(data, loc.get('output') if part == 'output' else loc)
        if index < 0 or index >= len(blocks) or not isinstance(blocks[index], dict):
            raise FileNotFoundError('图片附件不存在')
        image = image_bytes(blocks[index])
        if image is None: raise FileNotFoundError('原始记录没有可读取的图片')
        return image
