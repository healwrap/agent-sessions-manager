"""Install a checksum-verified upstream browser into application-owned storage."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import urllib.request
from uuid import uuid4

API = 'https://api.github.com/repos/adryfish/fingerprint-chromium/releases?per_page=10'


class KernelInstaller:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.lock = threading.RLock()
        self.result = {'state': 'idle', 'progress': 0, 'message': '', 'error': ''}

    def state(self):
        with self.lock: return dict(self.result)

    def update(self, **value):
        with self.lock: self.result.update(value)

    def start(self):
        if sys.platform != 'darwin': raise ValueError('当前内置安装器支持 macOS，可自行指定独立内核路径')
        with self.lock:
            if self.result['state'] == 'installing': return self.state()
            self.result = {'state': 'installing', 'progress': 0, 'message': '正在查询 macOS 内核版本', 'error': ''}
        threading.Thread(target=self._install, daemon=True).start()
        return self.state()

    def _install(self):
        staging = self.directory/('staging-'+str(uuid4()))
        mount = staging/'mount'
        mounted = False
        try:
            staging.mkdir(parents=True, mode=0o700)
            request = urllib.request.Request(API, headers={'User-Agent': 'Agent-Sessions', 'Accept': 'application/vnd.github+json'})
            with urllib.request.urlopen(request, timeout=25) as response:
                releases = json.loads(response.read(2000000))
            selected = next(((release, asset) for release in releases if not release['prerelease'] and not release['draft']
                             for asset in release['assets'] if asset['name'].endswith('_macos.dmg') and asset.get('digest', '').startswith('sha256:')), None)
            if not selected: raise ValueError('上游暂未提供带校验值的 macOS 内核')
            release, asset = selected
            version, url = release['tag_name'], asset['browser_download_url']
            if not version.replace('.', '').isdigit() or not url.startswith('https://github.com/adryfish/fingerprint-chromium/releases/download/'):
                raise ValueError('上游内核地址无效')
            destination = self.directory/'versions'/version/'Chromium.app'
            executable = destination/'Contents/MacOS/Chromium'
            from .kernel import fingerprint_capable
            if executable.is_file() and fingerprint_capable(str(executable), executable.stat().st_mtime_ns):
                self._verify_bundle(destination)
                self._manifest(version, executable, release['html_url'], asset['digest'].removeprefix('sha256:'))
                self.update(state='ready', progress=100, message='当前 macOS 内核已是上游最新可用版本')
                return
            archive = staging/'browser.dmg'
            self.update(message=f'正在下载 Fingerprint Chromium {version}', version=version)
            request = urllib.request.Request(url, headers={'User-Agent': 'Agent-Sessions'})
            digest, size = hashlib.sha256(), 0
            with urllib.request.urlopen(request, timeout=30) as response, archive.open('wb') as handle:
                while True:
                    block = response.read(1024*1024)
                    if not block: break
                    size += len(block)
                    if size > asset['size']: raise ValueError('内核下载大小与发布记录不符')
                    handle.write(block); digest.update(block)
                    self.update(progress=round(size/asset['size']*85))
            if size != asset['size'] or 'sha256:'+digest.hexdigest() != asset['digest']:
                raise ValueError('内核下载校验失败，请重新安装')
            self.update(message='正在安装已校验的浏览器内核', progress=90)
            mount.mkdir()
            subprocess.run(['hdiutil', 'attach', str(archive), '-readonly', '-nobrowse', '-mountpoint', str(mount)], check=True, capture_output=True, timeout=60)
            mounted = True
            app = next(mount.glob('*.app'), None)
            if not app: raise ValueError('内核安装包中没有浏览器应用')
            destination = self.directory/'versions'/version/'Chromium.app'
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists(): shutil.rmtree(destination)
            subprocess.run(['ditto', str(app), str(destination)], check=True, capture_output=True, timeout=90)
            from .kernel import fingerprint_capable
            executable = destination/'Contents/MacOS/Chromium'
            if not executable.is_file() or not fingerprint_capable(str(executable), executable.stat().st_mtime_ns):
                raise ValueError('下载的内核没有提供指纹能力')
            self._verify_bundle(destination)
            self._manifest(version, executable, release['html_url'], digest.hexdigest())
            self.update(state='ready', progress=100, message='独立浏览器内核已安装')
        except Exception as error:
            self.update(state='failed', error=str(error), message='内核安装未完成')
        finally:
            if mounted:
                subprocess.run(['hdiutil', 'detach', str(mount)], capture_output=True, timeout=30)
            if not mount.is_mount(): shutil.rmtree(staging, ignore_errors=True)

    def _manifest(self, version, executable, source, digest):
        manifest = self.directory/'current.json'
        temporary = manifest.with_suffix('.tmp')
        temporary.write_text(json.dumps({'version': version, 'executable': str(executable), 'source_url': source, 'sha256': digest}))
        temporary.replace(manifest)

    def _verify_bundle(self, bundle):
        command = ['codesign', '--verify', '--deep', '--strict', str(bundle)]
        result = subprocess.run(command, capture_output=True, timeout=30)
        if result.returncode and b'resource fork, Finder information' in result.stderr:
            # Finder metadata copied from a DMG is outside the signed payload.
            subprocess.run(['xattr', '-dr', 'com.apple.FinderInfo', str(bundle)], capture_output=True, timeout=30)
            result = subprocess.run(command, capture_output=True, timeout=30)
        if result.returncode: raise ValueError('浏览器内核签名校验未通过，请重新安装')
