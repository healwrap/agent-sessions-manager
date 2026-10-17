"""Read images referenced by visible Markdown, never by an arbitrary requested path."""
import html
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit
from agent_sessions.paths import file_uri_path

MAX_IMAGE_BYTES = 25*1024*1024
IMAGE = re.compile(r'!\[(?:\\.|[^\]\\\n])*\]\(\s*(?:<([^>\n]+)>|((?:\\.|[^\s()\\]+|\([^()\n]*\))+))(?:\s+[\"\'][^\n]*?[\"\'])?\s*\)')


def image_links(detail):
    if detail['event']['kind'] not in {'user', 'assistant', 'context'} or detail.get('part') == 'raw': return []
    text = detail.get('output_text', detail['text'])
    return [{'href': html.unescape(re.sub(r'\\([!"#$%&\'()*+,\-./:;<=>?@\[\]\\^_`{|}~])', r'\1', match[1] or match[2])),
             'page': detail['page']} for match in IMAGE.finditer(text)]


def local_image_bytes(href, cwd=''):
    raw = file_uri_path(href) if href.startswith('file:') else href
    path = Path(raw).expanduser()
    if not path.is_absolute():
        location = urlsplit(href)
        if location.scheme or location.netloc: raise FileNotFoundError('图片不是本地文件路径')
        directory = Path(cwd).expanduser()
        if not directory.is_absolute(): raise FileNotFoundError('会话没有本地绝对工作目录，无法定位图片')
        path = directory / unquote(location.path)
    if path.stat().st_size > MAX_IMAGE_BYTES: raise ValueError('图片超过读取上限')
    with path.open('rb') as handle: body = handle.read(MAX_IMAGE_BYTES+1)
    if len(body) > MAX_IMAGE_BYTES: raise ValueError('图片超过读取上限')
    mime = ('image/png' if body.startswith(b'\x89PNG\r\n\x1a\n') else
            'image/jpeg' if body.startswith(b'\xff\xd8\xff') else
            'image/gif' if body[:6] in {b'GIF87a', b'GIF89a'} else
            'image/webp' if body[:4] == b'RIFF' and body[8:12] == b'WEBP' else None)
    if not mime: raise ValueError('文件不是支持预览的图片')
    return body, mime


def message_image_bytes(detail, href):
    if href not in {link['href'] for link in image_links(detail)}:
        raise FileNotFoundError('当前消息没有引用该图片')
    return local_image_bytes(href, detail.get('cwd', ''))
