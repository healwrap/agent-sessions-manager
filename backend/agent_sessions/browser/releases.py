"""Read verified release metadata from GitHub API or its public release pages."""
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
import sys
import urllib.error
import urllib.request
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree

REPOSITORY = 'adryfish/fingerprint-chromium'
WEB = 'https://github.com/'+REPOSITORY
API = 'https://api.github.com/repos/'+REPOSITORY+'/releases?per_page=10'
VERSION = re.compile(r'\d+\.\d+\.\d+\.\d+')
DIGEST = re.compile(r'sha256:[a-f0-9]{64}')


def read_url(url, accept='application/octet-stream'):
    request = urllib.request.Request(url, headers={'User-Agent': 'Agent-Sessions', 'Accept': accept})
    with urllib.request.urlopen(request, timeout=25) as response:
        data = response.read(2_000_001)
    if len(data) > 2_000_000: raise ValueError('上游版本记录过大')
    return data


def valid(release, asset, platform=None):
    suffix = '_windows_x64.zip' if (platform or sys.platform) == 'win32' else '_macos.dmg'
    return (bool(VERSION.fullmatch(release.get('tag_name', ''))) and
            release.get('html_url') == WEB+'/releases/tag/'+release['tag_name'] and
            bool(DIGEST.fullmatch(asset.get('digest') or '')) and
            asset.get('browser_download_url', '').startswith(WEB+'/releases/download/'+release['tag_name']+'/') and
            asset.get('name', '').endswith(suffix))


class ReleaseAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.digests = {}, {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a':
            href = attrs.get('href', '')
            name = unquote(urlsplit(href).path.rsplit('/', 1)[-1])
            if href.startswith('/'+REPOSITORY+'/releases/download/') and name.endswith(('_macos.dmg', '_windows_x64.zip')):
                self.links[name] = 'https://github.com'+href
        if tag == 'clipboard-copy':
            label, digest = attrs.get('aria-label', ''), attrs.get('value', '')
            prefix = 'Copy to clipboard digest for '
            if label.startswith(prefix) and DIGEST.fullmatch(digest):
                self.digests[label[len(prefix):]] = digest


def public_release():
    feed = ElementTree.fromstring(read_url(WEB+'/releases.atom', 'application/atom+xml'))
    namespace = {'atom': 'http://www.w3.org/2005/Atom'}
    for entry in feed.findall('atom:entry', namespace)[:10]:
        link = entry.find('atom:link', namespace)
        url = link.get('href', '') if link is not None else ''
        version = url.rsplit('/', 1)[-1]
        release = {'tag_name': version, 'html_url': url}
        if not VERSION.fullmatch(version) or url != WEB+'/releases/tag/'+version: continue
        parser = ReleaseAssets()
        parser.feed(read_url(WEB+'/releases/expanded_assets/'+version, 'text/html').decode())
        for name, download in parser.links.items():
            asset = {'name': name, 'digest': parser.digests.get(name, ''), 'browser_download_url': download}
            if valid(release, asset): return release, asset
    raise ValueError('上游发布页没有提供带 SHA256 的适用内核')


def latest_platform(directory):
    cache = Path(directory)/'release-cache.json'
    try:
        value = json.loads(cache.read_text())
        if 0 <= time.time()-value['checked_at'] < 900 and valid(value['release'], value['asset']):
            return value['release'], value['asset'], True
    except (OSError, ValueError, KeyError, TypeError): pass
    try:
        releases = json.loads(read_url(API, 'application/vnd.github+json'))
        selected = next(((release, asset) for release in releases if not release['prerelease'] and not release['draft']
                         for asset in release['assets'] if valid(release, asset)), None)
        if not selected: raise ValueError('上游暂未提供带校验值的适用内核')
    except (urllib.error.URLError, TimeoutError, OSError) as api_error:
        try: selected = public_release()
        except (urllib.error.URLError, TimeoutError, OSError, ValueError, ElementTree.ParseError) as page_error:
            raise ValueError(f'无法检查上游版本：API {api_error}；发布页 {page_error}') from None
    cache.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = cache.with_suffix('.tmp')
    temporary.write_text(json.dumps({'checked_at': time.time(), 'release': selected[0], 'asset': selected[1]}))
    temporary.replace(cache)
    return selected[0], selected[1], False


latest_macos = latest_platform
