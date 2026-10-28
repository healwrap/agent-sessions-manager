"""Launch the official Claude app with isolated data and embedded Code settings."""
from datetime import datetime, timezone
import json
import hashlib
import os
from pathlib import Path
import subprocess
import threading
import time
import psutil
from agent_sessions.browser.gates import blocked
from agent_sessions.browser.preflight import inspect
from agent_sessions.browser.proxy import ProxyRelay
from agent_sessions.browser.session_state import session_state
from agent_sessions.browser.process_state import ProcessState
from .conflicts import warnings
from .focus import focus_process, quit_process
from .skills import sync_skills
from .plugins import sync_plugins
from agent_sessions.platform_process import claude_processes
from agent_sessions.applications import app_executable
from agent_sessions.profile_identity import ProfileIdentity, IdentityConflict
from .network import configure as configure_network
from .connections import ProcessConnections, ConnectionViolation, public


def app_processes():
    return claude_processes()


class AppRuntime:
    def __init__(self, directory, environments, proxy_manager=None):
        self.proxy_manager = proxy_manager
        self.identity = ProfileIdentity(directory)
        self.directory = Path(directory)/'claude-app'
        self.environments = environments
        self.lock = threading.RLock()
        self.runs, self.processes, self.relays = {}, {}, {}
        self.observers = {}
        self.registry = ProcessState(self.directory)
        settings = self.environments.read()
        app = next((row for row in settings['apps'] if row['id'] == 'claude'), None)
        executable = app_executable(app) if app else ''
        self.runs, self.processes = self.registry.restore(settings['app_profiles'], self.profile_directory, lambda profile: executable)

    def profile_directory(self, key):
        return self.directory/'profiles'/(hashlib.sha256(key.encode()).hexdigest()[:32]+'-3p')

    def state(self):
        with self.lock:
            for key, process in self.processes.items():
                if process.poll() is not None and self.runs[key]['status'] in ('running', 'interrupted'):
                    abnormal = process.returncode != 0 and not self.runs[key].get('cancelled')
                    self.runs[key].update(status='failed' if abnormal else 'stopped', stage='App 意外退出' if abnormal else 'App 已退出',
                                          error=f'App 返回码 {process.returncode}；请检查环境启动日志及系统中其他启动守卫' if abnormal else '')
                    relay = self.relays.pop(key, None)
                    if relay: threading.Thread(target=relay.close, daemon=True).start()
            settings = self.environments.read()
            for key, relay in self.relays.items():
                with relay.connections_lock: self.runs[key]['proxy_hosts'] = sorted(relay.observed_hosts)
            self.registry.save(self.runs)
            return {'warnings': warnings(), 'runs': [{**row, 'alive': bool(self.processes.get(key) and self.processes[key].poll() is None)} for key, row in self.runs.items()],
                    'sessions': {profile['id']: session_state(self.profile_directory(profile['id'])) for profile in settings['app_profiles']}}

    def open(self, value):
        if not isinstance(value, dict) or set(value)-{'profile_id', 'account_id'}: raise ValueError('账号打开参数无效')
        settings = self.environments.read()
        account = next((row for row in settings['accounts'] if row['id'] == value.get('account_id')), None)
        key = account.get('app_profile_id') if account else value.get('profile_id')
        with self.lock:
            process = self.processes.get(key)
            if self.runs.get(key, {}).get('status') == 'checking': return self.state()
            if process and process.poll() is None and self.runs[key]['status'] == 'running':
                if not focus_process(process.pid): raise ValueError('App 仍在运行，请切换到它的窗口')
                return self.state()
            if process and process.poll() is None: self.stop(key)
        return self.launch(value)

    def launch(self, value):
        if not isinstance(value, dict) or set(value)-{'profile_id', 'account_id'}: raise ValueError('App 启动参数无效')
        settings = self.environments.read()
        account = next((row for row in settings['accounts'] if row['id'] == value.get('account_id')), None)
        if value.get('account_id') and not account: raise ValueError('账号不存在')
        key = account.get('app_profile_id') if account else value.get('profile_id')
        profile = next((row for row in settings['app_profiles'] if row['id'] == key), None)
        if not profile: raise ValueError('请为账号绑定 Claude App 环境')
        self.identity.verify(settings, 'app_profiles', key)
        if getattr(self, 'component_guard', None): self.component_guard('claude')
        app = next((row for row in settings['apps'] if row['id'] == 'claude'), None)
        if not app: raise ValueError('请先安装官方 Claude App')
        proxy = next((row for row in settings['proxies'] if row['id'] == profile['proxy_id']), None)
        if profile['proxy_id'] and not proxy: raise ValueError('绑定的代理不存在')
        with self.lock:
            if any(row['status'] == 'checking' for row in self.runs.values()): raise ValueError('正在切换 App 环境，请稍候')
            if getattr(self, 'component_guard', None): self.component_guard('claude')
            process = self.processes.get(key)
            if process and process.poll() is None: raise ValueError('此 App 环境已打开')
            self.processes.pop(key, None)
            run = {'profile_id': key, 'account_id': account['id'] if account else '', 'name': profile['name'],
                   'status': 'checking', 'stage': '正在检查 App 启动环境', 'checked_at': datetime.now(timezone.utc).isoformat(),
                   'checks': [], 'resolved': {}, 'browser_checks': [], 'error': '', 'data_directory': str(self.profile_directory(key))}
            self.runs[key] = run
        threading.Thread(target=self._launch, args=(profile, proxy, app, run), daemon=True).start()
        return self.state()

    def _launch(self, profile, proxy, app, run):
        key = profile['id']
        try:
            if self.proxy_manager: self.proxy_manager.ensure(proxy, key)
            resolved, checks = inspect(profile, proxy, browser=False)
            with self.lock:
                if run.get('cancelled'): return
                run.update(resolved=resolved, checks=checks)
                if blocked(checks): run.update(status='blocked', stage='App 强制门控未通过'); return
                owned = {process.pid for process in self.processes.values() if process.poll() is None}
                if set(app_processes())-owned:
                    raise ValueError('请先退出自行打开的 Claude App，再启动隔离环境；现有登录数据会保留')
                for other in list(self.processes):
                    if self.processes[other].poll() is None: self.stop(other)
                directory = self.profile_directory(key)
                directory.mkdir(parents=True, exist_ok=True, mode=0o700)
                config = directory/'claude-code'
                config.mkdir(parents=True, exist_ok=True, mode=0o700)
                run['skill_inheritance'] = sync_skills(config, profile.get('inherit_skills', True))
                plugins = sync_plugins(config, self.directory/'plugin-library', profile.get('inherit_plugins', True))
                run['plugin_inheritance'] = {name: value for name, value in plugins.items() if name != 'environment'}
                settings_file = directory/'config.json'
                preferences = json.loads(settings_file.read_text()) if settings_file.exists() else {}
                requested_locale = resolved['locale']
                ui_locale = {'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant', 'zh-HK': 'zh-Hant'}.get(requested_locale, requested_locale)
                resources = Path(app['path'])/'Contents/Resources' if Path(app['path']).suffix.lower() == '.app' else Path(app_executable(app)).parent/'resources'
                if not (resources/(ui_locale+'.json')).is_file(): ui_locale = ui_locale.split('-')[0]
                preferences['locale'] = ui_locale
                temporary = settings_file.with_suffix('.tmp')
                temporary.write_text(json.dumps(preferences, ensure_ascii=False))
                temporary.replace(settings_file)
                relay = ProxyRelay(proxy['url'] if proxy else '')
                relay.released = True
                self.relays[key] = relay
                env = {name: value for name, value in os.environ.items() if name in ('HOME', 'PATH', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'SYSTEMROOT', 'WINDIR', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT')}
                env.update(CLAUDE_CONFIG_DIR=str(config), TZ=resolved['timezone'])
                env.update(plugins['environment'])
                env.update(configure_network(config, relay))
                args = [app_executable(app), '--user-data-dir='+str(directory),
                        '--proxy-server=http://127.0.0.1:'+str(relay.server_port),
                        '--lang='+resolved['locale'], '--accept-lang='+resolved['locale'], '--disable-quic',
                        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp']
                with (directory/'app-launch.log').open('ab') as log:
                    process = subprocess.Popen(args, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log)
                self.processes[key] = process
                self.observers[key] = ProcessConnections(process.pid)
                run.update(pid=process.pid, stage='正在确认 App 的独立数据目录')
            for attempt in range(60):
                if run.get('cancelled'): return
                if process.poll() is not None: raise ValueError(f'官方 App 已退出，退出码 {process.returncode}；请查看此环境启动日志')
                if any((directory/name).exists() for name in ('Cookies', 'Preferences', 'Local State')): break
                time.sleep(.25)
            else: raise ValueError('尚未确认官方 App 使用独立数据目录，已停止本次启动')
            with self.lock:
                if run.get('cancelled'): return
                checks += [dict(id='app-storage', title='App 登录数据隔离', policy='block', state='pass', value=str(directory), detail='官方 App 已在这个独立目录创建用户数据'),
                           dict(id='code-storage', title='内嵌 Code 配置隔离', policy='block', state='pass', value=str(config), detail='独立 CLAUDE_CONFIG_DIR，启动环境不继承 CLI 的供应商与思考强度变量')]
                identifiers = self.identity.verify(self.environments.read(), 'app_profiles', key)
                if identifiers:
                    checks.append(dict(id='app-identity', title='设备标识隔离', policy='block', state='pass',
                                       value='已生成的安装、账号与 Code 标识未与其他 App 环境重复', detail=''))
                run.update(status='running', stage='App 已启动，可在官方窗口登录', checks=checks,
                           checked_at=datetime.now(timezone.utc).isoformat())
            threading.Thread(target=self._observe, args=(key, run, process, bool(proxy)), daemon=True).start()
        except Exception as error:
            if run.get('cancelled'): return
            run.update(status='failed', stage='App 启动未完成', error=str(error))
            process = self.processes.get(key)
            if process and process.poll() is None: process.terminate()
            relay = self.relays.pop(key, None)
            if relay: relay.close()

    def _observe(self, key, run, process, proxied):
        while not run.get('cancelled') and process.poll() is None:
            try:
                self.identity.verify(self.environments.read(), 'app_profiles', key)
                observer = self.observers.get(key)
                if not observer: return
                rows = observer.sample()
                direct = [row for row in rows if public(row['host'])] if proxied else []
                if direct: raise ConnectionViolation('发现 App 进程树的公网直连：'+'、'.join(str(row['pid'])+' → '+row['host']+':'+str(row['port']) for row in direct))
                with self.lock:
                    if self.runs.get(key) is not run or run.get('cancelled'): return
                    run['network_observation'] = {'scope': 'process-tree', 'connections': rows,
                                                  'checked_at': datetime.now(timezone.utc).isoformat()}
                    check = dict(id='app-connections', title='App 连接采样', policy='warn', state='pass' if rows else 'unknown',
                                 value='已观测连接未发现公网直连' if proxied and rows else '当前没有连接样本' if not rows else '当前使用系统路由',
                                 detail='周期采样 App 及已发现子进程；系统级服务和 VM 内部进程尚未验收，不代表系统级阻断')
                    run['checks'] = [row for row in run['checks'] if row['id'] != check['id']]+[check]
            except (IdentityConflict, ConnectionViolation) as error:
                try: self.stop(key)
                except (ValueError, OSError, psutil.Error):
                    if process.poll() is None: process.kill(); process.wait(timeout=5)
                    relay = self.relays.pop(key, None)
                    if relay: relay.close()
                with self.lock:
                    check_id = 'app-connections' if isinstance(error, ConnectionViolation) else 'app-identity'
                    run['checks'] = [row for row in run['checks'] if row['id'] != check_id]+[
                        dict(id=check_id, title='App 连接采样' if check_id == 'app-connections' else '设备标识隔离',
                             policy='block', state='fail', value=str(error), detail='原登录数据保持在原目录')]
                    run.update(status='blocked', stage='环境检查发现异常，已停止 App', error=str(error))
                return
            except (OSError, ValueError, psutil.Error, subprocess.TimeoutExpired) as error:
                with self.lock:
                    run['network_observation'] = {'scope': 'unavailable', 'error': str(error)}
                    run['checks'] = [row for row in run['checks'] if row['id'] != 'app-connections']+[
                        dict(id='app-connections', title='App 连接采样', policy='warn', state='unknown',
                             value='未取得完整进程连接样本', detail=str(error))]
            time.sleep(2)

    def stop(self, key):
        with self.lock:
            if key not in self.runs: raise ValueError('此 App 环境尚未启动')
            self.runs[key]['cancelled'] = True
            process = self.processes.get(key)
            observer = self.observers.get(key)
            if observer: observer.processes()
            if process and process.poll() is None:
                if not quit_process(process.pid): process.terminate()
                try: process.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    if os.sys.platform != 'win32': raise ValueError('App 尚未退出，请关闭它的窗口后重试') from None
                    process.terminate()
                    process.wait(timeout=5)
            if observer:
                observer.finish()
                self.observers.pop(key, None)
            relay = self.relays.pop(key, None)
            if relay: relay.close()
            self.runs[key].update(status='stopped', stage='App 已停止，登录状态保留')
        return self.state()

    def ensure_mutable(self, value):
        if not isinstance(value, dict): return
        item = value.get('item', {})
        key = value.get('id') if value.get('action') == 'delete' else item.get('id') if isinstance(item, dict) else None
        settings = self.environments.read()
        with self.lock:
            for profile in settings['app_profiles']:
                run, process = self.runs.get(profile['id'], {}), self.processes.get(profile['id'])
                if run.get('status') != 'checking' and not (process and process.poll() is None): continue
                accounts = [row['id'] for row in settings['accounts'] if row.get('app_profile_id') == profile['id']]
                if ((value.get('collection') == 'app_profiles' and key == profile['id']) or
                    (value.get('collection') == 'proxies' and key == profile['proxy_id']) or
                    (value.get('collection') == 'accounts' and key in accounts)):
                    raise ValueError('请先停止对应的 Claude App 环境，再修改配置')

    def close(self):
        for key in list(self.runs):
            try: self.stop(key)
            except (ValueError, OSError): pass
