"""Attach Codex native media to its visible message and read one image on demand."""
import base64
import hashlib
import mimetypes
from pathlib import Path
from agent_sessions.context.artifacts import read_raw_entry, embedded_media_value, MAX_MEDIA_BYTES
from agent_sessions.context.text import DATA_URL_RE
from .message_images import local_image_bytes


def owner(turn, media):
    users = [message for message in turn['messages'] if message['role'] == 'user']
    return min(users, key=lambda message: abs(message.get('line_number', 0)-media.get('line_number', 0))) if users else None


def records(data, ref):
    category, record = data['lookup'][ref]
    if category == 'media': return [record]
    if category != 'message' or record['role'] != 'user': return []
    turn = next(turn for turn in data['turns'] if turn['seq'] == record['turn_seq'])
    return [media for media in turn['media'] if (message := owner(turn, media)) and message['ref'] == ref]


def describe(items):
    attachments = []
    for index, item in enumerate(items):
        raw = item.get('original_path') or item.get('path')
        path = Path(raw).expanduser() if raw else None
        available = item['locator'] == 'embedded' or (item['locator'] == 'local_path' and path.is_file())
        attachments.append({'index': index, 'kind': item['media_kind'],
                            'attachmentId': 'codex:'+item['ref'],
                            'mediaType': item.get('mime') or (mimetypes.guess_type(str(path))[0] if path else None),
                            'name': path.name if path else None,
                            'available': available and item['media_kind'] == 'image',
                            'unavailable_reason': None if available else '本机没有可读取的媒体副本'})
    return attachments


def attachment_bytes(data, ref, index):
    items = records(data, ref)
    if not 0 <= index < len(items): raise FileNotFoundError('图片附件不存在')
    item = items[index]
    if item['media_kind'] != 'image': raise FileNotFoundError('该附件不是图片')
    if item['locator'] == 'local_path': return local_image_bytes(item['path'])
    if item['locator'] != 'embedded': raise FileNotFoundError('本机没有可读取的图片副本')
    value = embedded_media_value(read_raw_entry(data['source'], item['offset']), item)
    match = DATA_URL_RE.fullmatch(value)
    if not match or match[1] not in {'image/png', 'image/jpeg', 'image/gif', 'image/webp'}:
        raise ValueError('图片格式不支持')
    if len(match[2]) > (MAX_MEDIA_BYTES+2)//3*4: raise ValueError('图片超过读取上限')
    if hashlib.sha256(match[2].encode('ascii', 'ignore')).hexdigest() != item['sha256']:
        raise ValueError('图片索引已变化，请刷新')
    return base64.b64decode(match[2], validate=True), match[1]
