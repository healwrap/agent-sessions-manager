"""Install a checksum-verified, application-owned Mihomo executable."""
from functools import lru_cache
import gzip
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import threading
import urllib.request
from uuid import uuid4

REPOSITORY = 'https://github.com/MetaCubeX/mihomo'
API = 'https://api.github.com/repos/MetaCubeX/mihomo/releases/latest'


def read_url(url, limit=2_000_000):
    request = urllib.request.Request(url, headers={'User-Agent': 'Agent-Sessions', 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(request, timeout=25) as response: data = response.read(limit+1)
    if len(data) > limit: raise ValueError('上游版本信息过大')
    return data


@lru_cache(maxsize=8)
def verified(path, modified, size, digest):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest


class ProxyCore:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.lock = threading.RLock()
        self.result = {'state': 'idle', 'progress': 0, 'message': '', 'error': ''}

    def discover(self):
        try:
            value = json.loads((self.directory/'current.json').read_text())
            path = (self.directory/value['executable']).resolve()
            stat = path.stat()
            if (path.is_relative_to(self.directory.resolve()) and os.access(path, os.X_OK)
                    and verified(str(path), stat.st_mtime_ns, stat.st_size, value['sha256'])):
                return {'available': True, 'path': str(path), 'version': value['version']}
        except (OSError, ValueError, KeyError): pass
        return {'available': False, 'path': '', 'version': ''}

    def state(self):
        with self.lock: return {**self.discover(), 'installation': dict(self.result)}

    def update(self, **fields):
        with self.lock: self.result.update(fields)

    def install(self):
        if sys.platform != 'darwin': raise ValueError('代理内核自动安装目前支持 macOS')
        with self.lock:
            if self.result['state'] == 'installing' or self.discover()['available']: return self.state()
            self.result = {'state': 'installing', 'progress': 0, 'message': '正在查询 Mihomo 官方版本', 'error': ''}
        threading.Thread(target=self._install, daemon=True).start()
        return self.state()

    def _install(self):
        staging = self.directory/('staging-'+str(uuid4()))
        try:
            release = json.loads(read_url(API))
            version = release['tag_name']
            if not re.fullmatch(r'v\d+\.\d+\.\d+', version) or release.get('draft') or release.get('prerelease'):
                raise ValueError('Mihomo 发布版本无效')
            arch = 'arm64' if platform.machine() in ('arm64', 'aarch64') else 'amd64-compatible'
            name = f'mihomo-darwin-{arch}-{version}.gz'
            asset = next((row for row in release['assets'] if row['name'] == name), None)
            if (not asset or not re.fullmatch(r'sha256:[a-f0-9]{64}', asset.get('digest') or '') or
                    asset['browser_download_url'] != REPOSITORY+'/releases/download/'+version+'/'+name):
                raise ValueError('官方发布记录中没有带 SHA256 校验的适用内核')
            staging.mkdir(parents=True, mode=0o700)
            archive = staging/'mihomo.gz'
            self.update(message='正在下载 Mihomo '+version, version=version)
            digest, size = hashlib.sha256(), 0
            request = urllib.request.Request(asset['browser_download_url'], headers={'User-Agent': 'Agent-Sessions'})
            with urllib.request.urlopen(request, timeout=30) as response, archive.open('wb') as output:
                while True:
                    block = response.read(1024*1024)
                    if not block: break
                    size += len(block)
                    if size > asset['size'] or size > 100*1024**2: raise ValueError('代理内核下载大小异常')
                    output.write(block); digest.update(block)
                    self.update(progress=round(size/asset['size']*85))
            if size != asset['size'] or 'sha256:'+digest.hexdigest() != asset['digest']:
                raise ValueError('代理内核下载校验失败')
            executable = staging/'mihomo'
            with gzip.open(archive, 'rb') as source, executable.open('wb') as output:
                size = 0
                while True:
                    block = source.read(1024*1024)
                    if not block: break
                    size += len(block)
                    if size > 200*1024**2: raise ValueError('代理内核解压大小异常')
                    output.write(block)
            executable.chmod(0o700)
            result = subprocess.run([str(executable), '-v'], capture_output=True, text=True, timeout=10)
            if result.returncode or 'Mihomo' not in result.stdout or version not in result.stdout:
                raise ValueError('已下载的代理内核无法运行')
            destination = self.directory/'versions'/version/'mihomo'
            destination.parent.mkdir(parents=True, exist_ok=True)
            executable.replace(destination)
            manifest = {'version': version, 'executable': str(destination.relative_to(self.directory)),
                        'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
                        'release_url': release['html_url'], 'source_url': REPOSITORY+'/tree/'+version,
                        'archive_sha256': asset['digest']}
            temporary = self.directory/'current.tmp'
            temporary.write_text(json.dumps(manifest)); temporary.replace(self.directory/'current.json')
            self.update(state='ready', progress=100, message='代理内核已安装')
        except Exception as error:
            self.update(state='failed', message='代理内核安装未完成', error=str(error))
        finally:
            shutil.rmtree(staging, ignore_errors=True)
