"""Cursor bubble media references, including messages with no text body."""
import json
import mimetypes
from pathlib import Path
from .cursor_storage import database, decode, fields, local_path

IMAGE_TYPES = {'image/png', 'image/jpeg', 'image/webp', 'image/gif'}


def media_records(db, table, record):
    base = record['path']
    values = fields(db, table, record['key'], tuple(base+suffix for suffix in
                    ('.images', '.context.selectedImages', '.context.selectedVideos')))
    result = []; by_id = {}
    for group, value in enumerate(values or ()):
        items = decode(value, [])
        if not isinstance(items, list): continue
        for item in items:
            if not isinstance(item, dict): continue
            kind = 'file' if group == 2 else 'image'
            identity = (kind, item.get('uuid') or item.get('path') or len(result))
            if identity in by_id:
                target = by_id[identity]
                target['value'] = {**target['value'], **item}
                target['original'].append(item)
            else:
                entry = {'kind': kind, 'value': item, 'original': [item]}
                by_id[identity] = entry; result.append(entry)
    return result


def image_path(store, item):
    raw = local_path(item.get('path'))
    if not raw: return None
    path = Path(raw).resolve()
    user = (store.root/'User' if (store.root/'User').is_dir() else store.root).resolve()
    # Resolve only a reference saved in this bubble, inside Cursor's own cache.
    if not path.is_relative_to(user/'workspaceStorage') or not path.is_file(): return None
    if mimetypes.guess_type(path.name)[0] not in IMAGE_TYPES: return None
    return path


def describe(store, records):
    result = []
    for index, record in enumerate(records):
        item = record['value']; path = image_path(store, item) if record['kind'] == 'image' else None
        name = item.get('name') or (Path(local_path(item.get('path'))).name if item.get('path') else '')
        dimension = item.get('dimension') or {}
        if not isinstance(dimension, dict): dimension = {}
        result.append({'index': index, 'kind': record['kind'],
                       'attachmentId': 'cursor:'+str(item.get('uuid') or index),
                       'name': name or ('视频' if record['kind'] == 'file' else '图片')+f' {index+1}',
                       'mediaType': mimetypes.guess_type(name)[0] if name else None,
                       'width': dimension.get('width'), 'height': dimension.get('height'),
                       'bytes': path.stat().st_size if path else None, 'available': path is not None,
                       'unavailable_reason': None if path else '本地记录未保存可读取的媒体文件，保留原始引用。'})
    return result


def enrich_detail(store, key, record, result):
    if record['kind'] not in ('user', 'assistant'): return result
    with database(store.rows[key]['_source']) as db:
        records = media_records(db, store.rows[key]['_table'], record)
    attachments = describe(store, records)
    if result['part'] == 'raw' and records:
        blocks = [{'type': 'text', 'content': result['text']}] if result['text'] else []
        blocks.extend({'type': entry['kind'], 'content': json.dumps(entry['original'], ensure_ascii=False, indent=2),
                       'attachment': attachments[index]} for index, entry in enumerate(records))
        result['source_blocks'] = blocks
    return {**result, 'attachments': attachments}


def attachment_bytes(store, key, ref, index, part):
    if part != 'input': raise FileNotFoundError('此 Cursor 记录没有结果附件')
    with store.lock:
        data = store.session(key)
        if ref not in data['lookup']: raise FileNotFoundError('此 Cursor 消息不存在')
        record = data['lookup'][ref][1]
        if record['kind'] not in ('user', 'assistant'): raise FileNotFoundError('此记录没有图片附件')
        with database(data['source']) as db:
            records = media_records(db, store.rows[key]['_table'], record)
        if index < 0 or index >= len(records) or records[index]['kind'] != 'image': raise FileNotFoundError('图片附件不存在')
        path = image_path(store, records[index]['value'])
        if path is None: raise FileNotFoundError('本地图片文件已不存在或位置未记录')
        if path.stat().st_size > 20*1024*1024: raise ValueError('图片超过预览大小限制')
        return path.read_bytes(), mimetypes.guess_type(path.name)[0]
