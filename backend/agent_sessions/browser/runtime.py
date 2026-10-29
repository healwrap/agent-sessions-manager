"""Own isolated browser processes; gate account navigation on actual browser reports."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import threading
import time
from . import kernel
from .installer import KernelInstaller
from .session_state import session_state
from agent_sessions.desktop_client.focus import focus_process
from .gates import blocked, browser_checks, check, policy
from .proxy import ProxyRelay
from .preflight import inspect
from .control import BrowserControl
from .process_state import ProcessState
from agent_sessions.profile_identity import ProfileIdentity, IdentityConflict


def account_url(provider):
    return 'https://claude.ai/new' if provider == 'claude' else 'https://chatgpt.com/'


class BrowserRuntime:
    def __init__(self, directory, environments, diagnostics, origin, proxy_manager=None):
        self.proxy_manager = proxy_manager
        self.identity = ProfileIdentity(directory)
        self.directory = Path(directory)/'browser'
        self.installer = KernelInstaller(self.directory/'kernel')
        self.environments, self.diagnostics, self.origin = environments, diagnostics, origin
        self.lock = threading.RLock()
        self.runs = {}
        self.processes, self.relays, self.controls = {}, {}, {}
        self.inspections = {}
        self.registry = ProcessState(self.directory)
        settings = self.environments.read()
        self.runs, self.processes = self.registry.restore(settings['profiles'], self.profile_directory,
            lambda profile: kernel.for_profile(profile, self.directory/'kernel', settings['apps'])['path'])

    def profile_directory(self, key):
        return self.directory/'profiles'/hashlib.sha256(key.encode()).hexdigest()[:32]

    def state(self):
        with self.lock:
            for key, process in self.processes.items():
                if process.poll() is not None and self.runs[key]['status'] in ('running', 'blocked', 'interrupted'):
                    if self.runs[key]['status'] != 'blocked':
                        abnormal = process.returncode != 0 and not self.runs[key].get('cancelled')
                        self.runs[key].update(status='failed' if abnormal else 'stopped', stage='浏览器意外退出' if abnormal else '浏览器已关闭',
                                              error=f'浏览器退出码 {process.returncode}' if abnormal else '')
                    control = self.controls.pop(key, None)
                    if control: control.close()
                    relay = self.relays.pop(key, None)
                    if relay: threading.Thread(target=relay.close, daemon=True).start()
            for key, control in self.controls.items():
                if self.processes[key].poll() is None:
                    try: self.runs[key]['pages'] = control.pages()
                    except ValueError as error: self.runs[key]['error'] = str(error)
            settings = self.environments.read()
            for profile in settings['profiles']:
                if profile['id'] in self.runs: self.runs[profile['id']]['name'] = profile['name']
            self.registry.save(self.runs)
            return {'kernel': {**kernel.discover(self.directory/'kernel'), 'installation': self.installer.state()}, 'sessions': {profile['id']: session_state(self.directory/'profiles'/hashlib.sha256(profile['id'].encode()).hexdigest()[:32], profile['provider']) for profile in settings['profiles']}, 'runs': [{**row, 'alive': bool(self.processes.get(key) and self.processes[key].poll() is None)} for key, row in self.runs.items()]}

    def update(self, key, **fields):
        with self.lock:
            self.runs[key].update(fields)
            self.registry.save(self.runs)

    def open(self, value):
        if not isinstance(value, dict) or set(value)-{'profile_id', 'account_id'}: raise ValueError('账号打开参数无效')
        settings = self.environments.read()
        account = next((row for row in settings['accounts'] if row['id'] == value.get('account_id')), None)
        if value.get('account_id') and not account: raise ValueError('账号不存在')
        key = account['profile_id'] if account else value.get('profile_id')
        if not account:
            account = next((row for row in settings['accounts'] if row['profile_id'] == key), None)
            if account: value = {'account_id': account['id']}
        with self.lock:
            process, run = self.processes.get(key), self.runs.get(key, {})
            if run.get('status') == 'checking': return self.state()
            if process and process.poll() is None and run.get('status') == 'running':
                if account:
                    self.controls[key].open(account_url(account['provider']), reuse=True)
                    self.update(key, account_id=account['id'])
                focus_process(process.pid)
                return self.state()
            if process and process.poll() is None:
                self.stop(key)
        return self.launch(value)

    def launch(self, value):
        if not isinstance(value, dict) or set(value)-{'profile_id', 'account_id'}:
            raise ValueError('浏览器启动参数无效')
        settings = self.environments.read()
        account = next((row for row in settings['accounts'] if row['id'] == value.get('account_id')), None)
        if value.get('account_id') and not account: raise ValueError('账号不存在')
        key = account['profile_id'] if account else value.get('profile_id')
        profile = next((row for row in settings['profiles'] if row['id'] == key), None)
        if not profile: raise ValueError('请选择已保存的浏览器环境')
        if profile['engine'] == 'chrome':
            raise ValueError('Google Chrome 环境已停用，请新建 Fingerprint Chromium 环境')
        self.identity.verify(settings, 'profiles', key)
        selected = next((row for row in settings['proxies'] if row['id'] == profile['proxy_id']), None)
        if profile['proxy_id'] and not selected: raise ValueError('绑定的代理不存在')
        if profile['engine'] != 'chrome' and getattr(self, 'component_guard', None): self.component_guard('fingerprint')
        found = kernel.for_profile(profile, self.directory/'kernel', settings['apps'])
        if not found['available']: raise ValueError('未找到 '+found['name']+'，请先安装对应浏览器')
        with self.lock:
            process = self.processes.get(key)
            if (process and process.poll() is None) or self.runs.get(key, {}).get('status') == 'checking':
                raise ValueError('此环境正在运行或检查，请先停止后再启动')
            if profile['engine'] != 'chrome' and getattr(self, 'component_guard', None): self.component_guard('fingerprint')
            self.processes.pop(key, None)
            self.runs[key] = {'profile_id': key, 'account_id': account['id'] if account else '',
                              'name': profile['name'], 'status': 'checking', 'stage': '正在检查代理出口',
                              'checked_at': datetime.now(timezone.utc).isoformat(), 'checks': [],
                              'resolved': {}, 'browser_checks': [], 'error': '', 'engine': found['name'],
                              'data_directory': str(self.profile_directory(key))}
        run = self.runs[key]
        threading.Thread(target=self._launch, args=(profile, selected, account, found, run), daemon=True).start()
        return self.state()

    def _launch(self, profile, proxy, account, found, run):
        key, ticket = profile['id'], None
        try:
            if self.proxy_manager: self.proxy_manager.ensure(proxy, key)
            modes = policy(profile)
            url = proxy['url'] if proxy else ''
            resolved, checks = inspect(profile, proxy)
            with self.lock:
                if run.get('cancelled'): return
                self.update(key, checks=checks, resolved=resolved)
                if blocked(checks):
                    self.update(key, status='blocked', stage='强制启动检查未通过'); return
            if run.get('cancelled'): return
            self.directory.mkdir(parents=True, exist_ok=True)
            profile_dir = self.profile_directory(key)
            profile_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
            self._prepare_preferences(profile_dir, resolved['locale'])
            with self.lock:
                if run.get('cancelled'): return
                relay = ProxyRelay(url)
                self.relays[key] = relay
                ticket = self.diagnostics.start({'target': 'profile:'+key}, context={
                    'expected': {field: resolved[field] for field in ('locale', 'timezone')},
                    'launch': {'state': 'checking'},
                    'probe_options': {'managed': True, 'exit_source': resolved.get('probe_source', ''), 'exit': modes['exit_ip'] != 'off', 'webrtc': modes['webrtc'] != 'off',
                                      'fingerprint': modes['fingerprint'] != 'off', 'dns': modes['dns'] != 'off'}})
                launch_url = self.origin+'/browser-check.html?ticket='+ticket['token']
                args = [found['path'], f'--user-data-dir={profile_dir}',
                        f'--lang={resolved["locale"]}', f'--accept-lang={resolved["locale"]},{resolved["locale"].split("-")[0]}',
                        f'--timezone={resolved["timezone"]}', f'--proxy-server=http://127.0.0.1:{relay.server_port}',
                        '--disable-non-proxied-udp', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
                        '--dns-prefetch-disable',
                        '--disable-background-networking', '--disable-quic', '--no-first-run', '--no-default-browser-check',
                        '--disable-session-crashed-bubble', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
                        '--new-window', 'about:blank']
                if profile['engine'] != 'chrome':
                    args += [f'--fingerprint={kernel.seed_number(profile["fingerprint_seed"])}',
                             '--fingerprint-platform='+{'darwin': 'macos', 'win32': 'windows'}.get(os.sys.platform, 'linux')]
                (profile_dir/'DevToolsActivePort').unlink(missing_ok=True)
                environment = {name: content for name, content in os.environ.items()
                               if name in ('HOME', 'PATH', 'TMPDIR', 'SYSTEMROOT', 'WINDIR', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT')}
                environment['TZ'] = resolved['timezone']
                with (profile_dir/'browser.log').open('ab') as log:
                    process = subprocess.Popen(args, env=environment, stdin=subprocess.DEVNULL, stdout=log, stderr=log)
                self.processes[key] = process
                self.update(key, stage='正在读取目标浏览器实测结果', pid=process.pid)
            control = BrowserControl(profile_dir, process, resolved, emulate=profile['engine'] == 'chrome')
            with self.lock:
                if run.get('cancelled'):
                    control.close(); return
                self.controls[key] = control
            control.open(launch_url)
            for attempt in range(30):
                if run.get('cancelled') or process.poll() is not None: break
                if focus_process(process.pid): break
                time.sleep(.1)
            deadline = time.monotonic()+180
            prompted = False
            report = None
            while time.monotonic() < deadline:
                if process.poll() is not None: raise ValueError(f'浏览器已退出，退出码 {process.returncode}')
                if run.get('cancelled'): return
                report = self.diagnostics.read(ticket['token'])['report']
                if report: break
                if not prompted and time.monotonic() > deadline-165:
                    prompted = True
                    self.update(key, stage='正在等待浏览器采样；若出现系统钥匙串提示，请先在本机处理' if os.sys.platform == 'darwin' else '正在等待浏览器完成启动采样')
                time.sleep(0.3)
            if not report: raise ValueError('目标浏览器未在 180 秒内完成启动采样'+('；如有系统钥匙串提示，请处理后重新打开环境' if os.sys.platform == 'darwin' else ''))
            baseline_file = profile_dir/'fingerprint-baseline.json'
            baseline = json.loads(baseline_file.read_text()) if baseline_file.exists() else None
            actual, next_baseline = browser_checks(profile, resolved, report['checks'], baseline)
            checks += actual
            identifiers = self.identity.browser(self.environments.read(), key, control)
            if identifiers:
                checks.append(dict(id='browser-identity', title='设备标识隔离', policy='block', state='pass',
                                   value='已观测的设备 Cookie 与其他浏览器环境不同', detail=''))
            allowed = not blocked(checks)
            result = {'state': 'allowed' if allowed else 'blocked', 'checks': checks,
                      'next_url': account_url(account['provider']) if account and allowed else ''}
            with self.lock:
                if run.get('cancelled'): return
                if allowed:
                    relay.released = True
                    if next_baseline:
                        temporary = baseline_file.with_suffix('.tmp')
                        temporary.write_text(json.dumps(next_baseline))
                        temporary.replace(baseline_file)
                self.diagnostics.set_launch(ticket['token'], result)
                self.update(key, status='running' if allowed else 'checking',
                            stage='已允许启动' if allowed else '启动检查未通过，正在关闭检测窗口', checks=checks,
                            browser_checks=report['checks'], checked_at=report['checked_at'])
            if not allowed:
                self._close_window(key)
                with self.lock:
                    if run.get('cancelled'): return
                    failures = [row['title'] for row in checks if row['policy'] == 'block' and row['state'] not in ('pass', 'skip')]
                    self.update(key, status='blocked', stage='启动已拦截，检测窗口已关闭',
                                error='启动已拦截：'+'、'.join(failures)+'未通过', pages=[])
            else:
                threading.Thread(target=self._observe_identity, args=(key, run, process, control), daemon=True).start()
        except Exception as error:
            if run.get('cancelled'): return
            self.update(key, status='failed', stage='启动未完成', error=str(error))
            if ticket:
                self.diagnostics.set_launch(ticket['token'], {'state': 'failed', 'error': str(error)})
            relay = self.relays.pop(key, None)
            if relay: relay.close()
            control = self.controls.pop(key, None)
            if control: control.close()
            process = self.processes.get(key)
            if process and process.poll() is None: process.terminate()

    def _observe_identity(self, key, run, process, control):
        while not run.get('cancelled') and process.poll() is None:
            try:
                values = self.identity.browser(self.environments.read(), key, control)
            except IdentityConflict as error:
                with self.lock:
                    if self.runs.get(key) is not run or run.get('cancelled'): return
                    self._close_window(key)
                    self.update(key, status='blocked', stage='设备标识隔离未通过', error=str(error))
                return
            except (ValueError, OSError):
                time.sleep(5); continue
            if values:
                with self.lock:
                    if self.runs.get(key) is not run or run.get('cancelled'): return
                    checks = [row for row in run['checks'] if row['id'] != 'browser-identity']
                    checks.append(dict(id='browser-identity', title='设备标识隔离', policy='block', state='pass',
                                       value='已观测的设备 Cookie 与其他浏览器环境不同', detail=''))
                    self.update(key, checks=checks)
            time.sleep(5)

    def _prepare_preferences(self, directory, locale):
        # Restore only the check page before the account domain is released.
        path = directory/'Default/Preferences'
        value = json.loads(path.read_text()) if path.exists() else {}
        value['network_prediction_options'] = 2
        value.setdefault('intl', {})['accept_languages'] = locale+','+locale.split('-')[0]
        value.setdefault('session', {})['restore_on_startup'] = 5
        value['session']['startup_urls'] = []
        value.setdefault('profile', {})['exit_type'] = 'Normal'
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(value))
        temporary.replace(path)

    def _close_window(self, key):
        forced = False
        with self.lock:
            process = self.processes.get(key)
            control = self.controls.pop(key, None)
            relay = self.relays.pop(key, None)
        if relay: relay.close()
        try:
            if process and process.poll() is None:
                if control: control.quit()
                else: process.terminate()
                try: process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    forced = True
                    process.kill()
                    process.wait(timeout=5)
        finally:
            if control: control.close()
        return forced

    def stop(self, key):
        with self.lock:
            if key not in self.runs: raise ValueError('环境尚未启动')
            self.runs[key]['cancelled'] = True
            rejected = blocked(self.runs[key].get('checks', []))
        forced = self._close_window(key)
        self.update(key, status='blocked' if rejected else 'stopped',
                    stage='启动已拦截，检测窗口已关闭' if rejected else '浏览器未响应退出，已结束此环境进程' if forced else '已停止')
        return self.state()

    def ensure_mutable(self, value):
        if not isinstance(value, dict): raise ValueError('环境配置格式无效')
        settings = self.environments.read()
        collection = value.get('collection')
        item = value.get('item')
        key = value.get('id') if value.get('action') == 'delete' else item.get('id') if isinstance(item, dict) else None
        with self.lock:
            if collection == 'profiles' and isinstance(item, dict):
                old = next((row for row in settings['profiles'] if row['id'] == key), None)
                normalize = lambda engine: 'fingerprint-chromium' if engine == 'ccbaga' else engine
                if old and normalize(old['engine']) != normalize(item.get('engine')) and (self.profile_directory(key)/'Default').exists():
                    raise ValueError('此环境已有浏览数据；更换内核请新建环境，以保留当前账号登录状态')
            for profile in settings['profiles']:
                run = self.runs.get(profile['id'], {})
                process = self.processes.get(profile['id'])
                live = run.get('status') == 'checking' or process and process.poll() is None
                accounts = [row['id'] for row in settings['accounts'] if row['profile_id'] == profile['id']]
                if live and ((collection == 'profiles' and key == profile['id']) or
                             (collection == 'proxies' and key == profile['proxy_id']) or
                             (collection == 'accounts' and key in accounts)):
                    raise ValueError('请先停止使用此配置的浏览器环境，再修改或删除')

    def close(self):
        for key in list(self.runs):
            try: self.stop(key)
            except (ValueError, OSError): pass
