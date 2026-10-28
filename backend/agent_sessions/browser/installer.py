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
from .releases import latest_macos
from agent_sessions.components.artifacts import extract_zip


class KernelInstaller:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.lock = threading.RLock()
        self.result = {'state': 'idle', 'progress': 0, 'message': '', 'error': ''}

    def state(self):
        with self.lock: return dict(self.result)

    def update(self, **value):
        with self.lock: self.result.update(value)

    def start(self, check_only=False):
        if sys.platform not in ('darwin', 'win32'): raise ValueError('内置安装器支持 macOS 和 Windows')
        if sys.platform == 'darwin':
            import platform
            if platform.machine() not in ('arm64', 'aarch64'): raise ValueError('上游指纹内核仅提供 Apple Silicon 版本，Intel Mac 请安装受管 Chrome')
        with self.lock:
            if self.result['state'] in ('checking', 'installing'): return self.state()
            self.result = {'state': 'checking' if check_only else 'installing', 'progress': 0, 'message': '正在查询浏览器内核版本', 'error': ''}
        threading.Thread(target=self._install, args=(check_only,), daemon=True).start()
        return self.state()

    def _install(self, check_only=False):
        staging = self.directory/('staging-'+str(uuid4()))
        mount = staging/'mount'
        mounted = False
        try:
            if sys.platform == 'win32':
                self._windows(check_only, staging)
                return
            release, asset, cached = latest_macos(self.directory)
            version, url = release['tag_name'], asset['browser_download_url']
            self.update(version=version)
            from .kernel import discover, fingerprint_capable
            current = discover(self.directory)
            if check_only:
                same = current['available'] and tuple(map(int, current['version'].split('.'))) >= tuple(map(int, version.split('.')))
                self.update(state='ready' if same else 'update_available', progress=100,
                            message=('已是最新 macOS 内核' if same else f'可安装 macOS 内核 {version}')+('（15 分钟内的检查结果）' if cached else ''))
                return
            destination = self.directory/'versions'/version/'Chromium.app'
            executable = destination/'Contents/MacOS/Chromium'
            if executable.is_file() and fingerprint_capable(str(executable), executable.stat().st_mtime_ns):
                self._verify_bundle(destination)
                self._manifest(version, executable, release['html_url'], asset['digest'].removeprefix('sha256:'))
                self.update(state='ready', progress=100, message='当前 macOS 内核已是上游最新可用版本')
                return
            archive = staging/'browser.dmg'
            staging.mkdir(parents=True, mode=0o700)
            self.update(message=f'正在下载 Fingerprint Chromium {version}', version=version)
            request = urllib.request.Request(url, headers={'User-Agent': 'Agent-Sessions'})
            digest, size = hashlib.sha256(), 0
            with urllib.request.urlopen(request, timeout=30) as response, archive.open('wb') as handle:
                expected_size = asset.get('size') or int(response.headers.get('Content-Length') or 0)
                while True:
                    block = response.read(1024*1024)
                    if not block: break
                    size += len(block)
                    if size > 2*1024**3 or (expected_size and size > expected_size): raise ValueError('内核下载大小与发布记录不符')
                    handle.write(block); digest.update(block)
                    if expected_size: self.update(progress=round(size/expected_size*85))
            if (expected_size and size != expected_size) or 'sha256:'+digest.hexdigest() != asset['digest']:
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
            self.update(state='failed', error=str(error), message='更新检查失败' if check_only else '内核安装未完成')
        finally:
            if mounted:
                subprocess.run(['hdiutil', 'detach', str(mount)], capture_output=True, timeout=30)
            if not mount.is_mount(): shutil.rmtree(staging, ignore_errors=True)

    def _windows(self, check_only, staging):
        from .kernel import discover, fingerprint_capable
        from agent_sessions.components.artifacts import download
        release, asset, _ = latest_macos(self.directory)
        version = release['tag_name']
        current = discover(self.directory)
        self.update(version=version)
        if check_only:
            same = current['available'] and tuple(map(int, current['version'].split('.'))) >= tuple(map(int, version.split('.')))
            self.update(state='ready' if same else 'update_available', progress=100, message='检查完成')
            return
        staging.mkdir(parents=True, mode=0o700)
        archive = staging/'browser.zip'
        digest = download(asset['browser_download_url'], archive, self.update, asset['digest'], asset.get('size', 0))
        extract_zip(archive, staging/'unpacked')
        executable = next((staging/'unpacked').rglob('chrome.exe'), None)
        if not executable or not fingerprint_capable(str(executable), executable.stat().st_mtime_ns):
            raise ValueError('下载的 Windows 内核没有提供指纹能力')
        destination = self.directory/'versions'/version
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists(): shutil.rmtree(destination)
        shutil.move(str(staging/'unpacked'), destination)
        executable = next(destination.rglob('chrome.exe'))
        self._manifest(version, executable, release['html_url'], digest)
        self.update(state='ready', progress=100, message='Windows 浏览器内核已安装')

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
