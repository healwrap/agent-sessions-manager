"""Versioned, signature-verified desktop components; preserve account profiles."""
import base64
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import threading
from uuid import uuid4
from agent_sessions.applications import managed_app, installed_apps, app_version
from agent_sessions.platform_process import powershell, ps_literal, appx_packages
from agent_sessions.private_files import private_json
from .artifacts import download, extract_zip, remove_owned
from .catalog import latest, newer
from .native_uninstall import uninstall


class DesktopInstaller:
    def __init__(self, directory):
        self.home, self.key = Path(directory), 'claude'
        self.directory = self.home/'components'/'claude'
        self.lock = threading.RLock()
        self.result = {'state': 'idle', 'progress': 0, 'message': '', 'error': ''}

    def state(self):
        with self.lock: return dict(self.result)

    def update(self, **value):
        with self.lock: self.result.update(value)

    def start(self, action, *, path=''):
        with self.lock:
            if self.result['state'] in ('checking', 'installing', 'removing'): raise ValueError('此组件正在处理，请稍候')
            self.result = {'state': {'check': 'checking', 'install': 'installing', 'remove': 'removing'}[action],
                           'progress': 0, 'message': '正在处理官方组件', 'error': ''}
        threading.Thread(target=self._work, args=(action, path), daemon=True).start()
        return self.state()

    def _work(self, action, path=''):
        staging = self.directory/('staging-'+str(uuid4()))
        try:
            if action == 'remove':
                message = self._remove(path)
                self.update(state='idle', progress=100, message=message)
                return
            release = latest()
            self.update(version=release['version'])
            current = managed_app(self.home, self.key)
            if action == 'check':
                current = current or next((row for row in installed_apps(self.home) if row['id'] == self.key), None)
                self.update(state='update_available' if not current or newer(release['version'], current['version']) else 'ready', progress=100,
                            message='官方版本检查完成')
                return
            staging.mkdir(parents=True, mode=0o700)
            archive = self.directory/'downloads'/(release['version']+'.'+release['format'])
            archive.parent.mkdir(parents=True, exist_ok=True)
            digest = self._download(release, archive)
            self.update(progress=90, message='正在校验并安装官方组件')
            if release['format'] == 'msix':
                manifest = self._windows_claude(archive, release)
            else:
                unpacked = staging/'unpacked'
                extract_zip(archive, unpacked, macos=True)
                app = next(unpacked.rglob('Claude.app'), None)
                if not app: raise ValueError('官方安装包缺少应用')
                self._mac_signature(app)
                relative_exe = Path('Contents/MacOS/Claude')
                destination = self.directory/'versions'/release['version']/str(uuid4())[:8]/app.name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(app), destination)
                manifest = {'path': str(destination), 'executable': str(destination/relative_exe),
                            'version': app_version(destination) or release['version']}
            private_json(self.directory/'current.json', {**manifest, 'source_url': release['url'], 'archive_sha256': digest})
            self.update(state='ready', progress=100, message='官方组件已安装')
        except Exception as error:
            self.update(state='failed', error=str(error), message='组件操作未完成')
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    def _download(self, release, archive):
        record = archive.with_suffix('.json')
        if archive.exists() and record.exists():
            value = json.loads(record.read_text())
            with archive.open('rb') as handle: digest = hashlib.file_digest(handle, 'sha256').hexdigest()
            if value.get('url') == release['url'] and value.get('sha256') == digest:
                self.update(progress=85)
                return digest
        digest = download(release['url'], archive, self.update)
        private_json(record, {'url': release['url'], 'sha256': digest})
        return digest

    def _mac_signature(self, app):
        command = ['codesign', '--verify', '--deep', '--strict', str(app)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=60)
        if result.returncode and 'resource fork, Finder information' in result.stderr:
            subprocess.run(['xattr', '-dr', 'com.apple.FinderInfo', str(app)], capture_output=True, timeout=30)
            result = subprocess.run(command, capture_output=True, text=True, timeout=60)
        if result.returncode: raise ValueError('应用签名校验未通过：'+result.stderr[-1200:])
        output = subprocess.run(['codesign', '-dv', '--verbose=4', str(app)], capture_output=True, text=True, timeout=15).stderr
        expected = 'Q6L2SF6YDW'
        if 'TeamIdentifier='+expected not in output: raise ValueError('应用签名发布者不符')

    def _windows_signature(self, path, publisher):
        script = '$s=Get-AuthenticodeSignature -FilePath '+ps_literal(path)+"; if($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notlike '*"+publisher+"*'){throw '应用签名发布者不符'}"
        powershell(script)

    def _windows_claude(self, archive, release):
        self._windows_signature(archive, 'Anthropic')
        self.update(message='请在 Windows 授权安装官方 Claude，安装可能需要数分钟')
        self._elevated('Add-AppxPackage -Path '+ps_literal(archive))
        packages = appx_packages(refresh=True)
        package = next((row for row in packages if row['Name'].lower() == 'claude'), None)
        if not package: raise ValueError('官方安装未注册 Claude，请检查 Windows 安装提示')
        root = Path(package['InstallLocation'])
        exe = next((root/relative for relative in ('app/Claude.exe', 'Claude.exe') if (root/relative).is_file()), None)
        if not exe: raise ValueError('已安装的 Claude 缺少主程序')
        return {'path': str(exe), 'executable': str(exe), 'version': package['Version'], 'package_full_name': package['PackageFullName'], 'package_family_name': package['PackageFamilyName']}

    def _elevated(self, script):
        payload = base64.b64encode(('$ErrorActionPreference="Stop"; try { '+script+'; exit 0 } catch { exit 1 }').encode('utf-16-le')).decode()
        powershell("$p=Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile -NonInteractive -EncodedCommand "+payload+"' -Wait -PassThru; if($p.ExitCode -ne 0){throw 'Windows 安装或卸载未完成，请检查授权与系统提示'}", timeout=600)

    def _remove(self, expected_path):
        app = next((row for row in installed_apps(self.home) if row['id'] == self.key), None)
        if not app or app['path'] != expected_path: raise ValueError('组件安装位置已变化，请重新确认卸载')
        if app.get('managed'):
            if app.get('package_full_name'): uninstall(app)
            remove_owned(self.directory)
        else: uninstall(app)
        if any(row['id'] == self.key for row in installed_apps(self.home)):
            return '所选版本已卸载，仍检测到本机其他安装；独立账号和环境数据保留'
        return 'Claude App 已卸载，独立账号和环境数据保留'
