"""One lifecycle API for owned runtimes and discovered native installations."""
from pathlib import Path
import platform
import sys
from agent_sessions.applications import installed_apps, managed_app
from agent_sessions.browser import kernel
from agent_sessions.platform_process import claude_processes
from .artifacts import remove_owned
from .desktop_installer import DesktopInstaller

NAMES = {'fingerprint': 'Fingerprint Chromium', 'chrome': 'Google Chrome', 'mihomo': 'Mihomo', 'claude': 'Claude App'}


class ComponentManager:
    def __init__(self, directory, browser, app, proxies):
        self.directory = Path(directory)
        self.browser, self.app, self.proxies = browser, app, proxies
        self.desktop = {key: DesktopInstaller(directory, key) for key in ('chrome', 'claude')}

    def installer(self, key):
        return self.browser.installer if key == 'fingerprint' else self.proxies.core if key == 'mihomo' else self.desktop[key]

    def operation(self, key):
        installer = self.installer(key)
        return dict(installer.result) if key == 'mihomo' else installer.state()

    def ready(self, key):
        if self.operation(key)['state'] in ('installing', 'removing'):
            raise ValueError(NAMES[key]+' 正在安装、更新或卸载，请完成后再启动环境')

    def state(self):
        apps = installed_apps(self.directory)
        rows = []
        for key, name in NAMES.items():
            if key == 'fingerprint':
                found = kernel.discover(self.browser.directory/'kernel')
                owned = found.get('source') == 'Agent Sessions 管理'
            elif key == 'mihomo':
                found = self.proxies.core.discover()
                owned = found['available']
            else:
                app = next((row for row in apps if row['id'] == key), None)
                found = {'available': bool(app), 'version': (app or {}).get('version', ''), 'path': (app or {}).get('path', '')}
                owned = bool(app and app.get('managed'))
            supported = sys.platform in ('darwin', 'win32') and not (key == 'fingerprint' and sys.platform == 'darwin' and platform.machine() not in ('arm64', 'aarch64'))
            rows.append({'id': key, 'name': name, **found, 'managed': owned, 'supported': supported,
                         'source': '应用管理' if owned else '本机安装' if found['available'] else '尚未安装',
                         'installation': self.operation(key)})
        return {'platform': 'Windows' if sys.platform == 'win32' else 'macOS' if sys.platform == 'darwin' else sys.platform,
                'architecture': platform.machine(), 'items': rows}

    def _mutable(self, key):
        self.ready(key)
        if key in ('chrome', 'fingerprint'):
            profiles = self.browser.environments.read()['profiles']
            for profile in profiles:
                if (profile['engine'] == 'chrome') != (key == 'chrome'): continue
                run = self.browser.runs.get(profile['id'], {})
                process = self.browser.processes.get(profile['id'])
                if run.get('status') == 'checking' or process and process.poll() is None:
                    raise ValueError('请先停止使用此浏览器的环境，再安装、更新或卸载')
        elif key == 'claude':
            if claude_processes() or any(row['status'] == 'checking' for row in self.app.runs.values()):
                raise ValueError('请先退出 Claude App，再安装、更新或卸载')
        elif key == 'mihomo':
            if any(row['alive'] for row in self.proxies.state()['entries']):
                raise ValueError('请先停止所有专用代理，再更新或卸载代理内核')

    def command(self, value):
        if not isinstance(value, dict) or value.get('id') not in NAMES: raise ValueError('组件操作参数无效')
        key = value['id']
        runtime = self.proxies if key == 'mihomo' else self.app if key == 'claude' else self.browser
        with runtime.lock: return self._command(value)

    def _command(self, value):
        if not isinstance(value, dict) or set(value) != {'id', 'action'}: raise ValueError('组件操作参数无效')
        key, action = value['id'], value['action']
        if key not in NAMES or action not in ('check', 'install', 'remove'): raise ValueError('组件操作无效')
        if action != 'check': self._mutable(key)
        if action == 'remove':
            row = next(item for item in self.state()['items'] if item['id'] == key)
            if not row['managed']: raise ValueError('只能卸载由本应用管理的组件')
            if key in self.desktop: self.desktop[key].start(action)
            else:
                root = self.browser.directory/'kernel' if key == 'fingerprint' else self.proxies.core.directory
                remove_owned(root)
                self.installer(key).update(state='idle', progress=0, error='', message='组件已卸载，环境数据保留')
                if key == 'mihomo': self.proxies.processes.clear()
        elif key == 'fingerprint': self.browser.installer.start(check_only=action == 'check')
        elif key == 'mihomo': self.proxies.core.install(check_only=action == 'check')
        else: self.desktop[key].start(action)
        return self.state()
