"""Resolve current official Chrome for Testing and Claude release packages."""
import json
import platform
import re
import sys
import urllib.request
from urllib.parse import urlsplit


def read_json(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Agent-Sessions'})
    with urllib.request.urlopen(request, timeout=25) as response: data = response.read(2_000_001)
    if len(data) > 2_000_000: raise ValueError('官方版本记录过大')
    return json.loads(data)


def latest(key):
    arm = platform.machine().lower() in ('arm64', 'aarch64')
    if sys.platform not in ('darwin', 'win32'): raise ValueError('组件安装支持 Windows 和 macOS')
    if key == 'chrome':
        target = 'win64' if sys.platform == 'win32' else 'mac-arm64' if arm else 'mac-x64'
        release = read_json('https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json')['channels']['Stable']
        if not re.fullmatch(r'\d+(?:\.\d+){3}', release['version']): raise ValueError('Chrome 官方版本号无效')
        asset = next(row for row in release['downloads']['chrome'] if row['platform'] == target)
        url = asset['url']
        if not url.startswith('https://storage.googleapis.com/chrome-for-testing-public/'+release['version']+'/'):
            raise ValueError('Chrome 官方下载地址无效')
        if sys.platform == 'darwin':
            return {'version': release['version'], 'url': 'https://dl.google.com/chrome/mac/universal/stable/GGRO/googlechrome.dmg', 'format': 'dmg'}
        return {'version': release['version'], 'url': url, 'format': 'zip'}
    if key != 'claude': raise ValueError('组件不存在')
    if sys.platform == 'darwin':
        feed = read_json('https://downloads.claude.ai/releases/darwin/universal/RELEASES.json')
        version = feed['currentRelease']
        if not re.fullmatch(r'\d+(?:\.\d+){2,3}', version): raise ValueError('Claude 官方版本号无效')
        release = next(row for row in feed['releases'] if row['version'] == version)
        url = release['updateTo']['url']
        if not url.startswith('https://downloads.claude.ai/releases/darwin/universal/'+version+'/'):
            raise ValueError('Claude 官方下载地址无效')
        return {'version': version, 'url': url, 'format': 'zip'}
    target = 'arm64' if arm else 'x64'
    endpoint = f'https://claude.ai/api/desktop/win32/{target}/msix/latest/redirect'
    # This official endpoint supports GET only. Close the body after resolving its signed package URL.
    with urllib.request.urlopen(urllib.request.Request(endpoint, headers={'User-Agent': 'Agent-Sessions'}), timeout=25) as response:
        url = response.url
    parsed = urlsplit(url)
    match = re.fullmatch(r'/releases/win32/'+target+r'/(\d+(?:\.\d+){2,3})/[^/]+\.msix', parsed.path)
    if parsed.scheme != 'https' or parsed.hostname != 'downloads.claude.ai' or not match:
        raise ValueError('Claude Windows 官方下载地址无效')
    return {'version': match[1], 'url': url, 'format': 'msix'}


def newer(candidate, current):
    parts = lambda text: tuple(int(row) for row in text.lstrip('v').split('.'))
    try:
        left, right = parts(candidate), parts(current)
        size = max(len(left), len(right))
        return left+(0,)*(size-len(left)) > right+(0,)*(size-len(right))
    except ValueError: return True
