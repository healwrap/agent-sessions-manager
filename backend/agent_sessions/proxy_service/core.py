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
from agent_sessions.components.artifacts import download, extract_zip
from agent_sessions.platform_process import background_options

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

    def install(self, check_only=False):
        if sys.platform not in ('darwin', 'win32'): raise ValueError('代理内核安装支持 macOS 和 Windows')
        with self.lock:
            if self.result['state'] in ('installing', 'checking', 'removing'): return self.state()
            self.result = {'state': 'checking' if check_only else 'installing', 'progress': 0, 'message': '正在查询 Mihomo 官方版本', 'error': ''}
        threading.Thread(target=self._install, args=(check_only,), daemon=True).start()
        return self.state()

    def _install(self, check_only=False):
        staging = self.directory/('staging-'+str(uuid4()))
        try:
            release = json.loads(read_url(API))
            version = release['tag_name']
            if not re.fullmatch(r'v\d+\.\d+\.\d+', version) or release.get('draft') or release.get('prerelease'):
                raise ValueError('Mihomo 发布版本无效')
            arch = 'arm64' if platform.machine().lower() in ('arm64', 'aarch64') else 'amd64-compatible'
            windows = sys.platform == 'win32'
            name = f'mihomo-{"windows" if windows else "darwin"}-{arch}-{version}.{"zip" if windows else "gz"}'
            asset = next((row for row in release['assets'] if row['name'] == name), None)
            if (not asset or not re.fullmatch(r'sha256:[a-f0-9]{64}', asset.get('digest') or '') or
                    asset['browser_download_url'] != REPOSITORY+'/releases/download/'+version+'/'+name):
                raise ValueError('官方发布记录中没有带 SHA256 校验的适用内核')
            current = self.discover()
            self.update(version=version)
            if check_only:
                newer = not current['available'] or tuple(map(int, version[1:].split('.'))) > tuple(map(int, current['version'].lstrip('v').split('.')))
                self.update(state='update_available' if newer else 'ready', progress=100, message='检查完成')
                return
            staging.mkdir(parents=True, mode=0o700)
            archive = staging/'mihomo.gz'
            self.update(message='正在下载 Mihomo '+version, version=version)
            download(asset['browser_download_url'], archive, self.update, asset['digest'], asset['size'], limit=100*1024**2)
            executable = staging/('mihomo.exe' if windows else 'mihomo')
            if windows:
                extract_zip(archive, staging/'unpacked')
                unpacked = next((staging/'unpacked').rglob('*.exe'), None)
                if not unpacked: raise ValueError('Windows 安装包缺少代理内核')
                shutil.move(unpacked, executable)
            else:
                self._gunzip(archive, executable)
            executable.chmod(0o700)
            result = subprocess.run([str(executable), '-v'], capture_output=True, text=True, timeout=10, **background_options())
            if result.returncode or 'Mihomo' not in result.stdout or version not in result.stdout:
                raise ValueError('已下载的代理内核无法运行')
            destination = self.directory/'versions'/version/executable.name
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
            self.update(state='failed', message='代理内核操作未完成', error=str(error))
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    def _gunzip(self, archive, executable):
        with gzip.open(archive, 'rb') as source, executable.open('wb') as output:
            size = 0
            while True:
                block = source.read(1024*1024)
                if not block: break
                size += len(block)
                if size > 200*1024**2: raise ValueError('代理内核解压大小异常')
                output.write(block)
