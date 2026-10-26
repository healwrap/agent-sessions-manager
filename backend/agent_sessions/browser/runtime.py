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


class BrowserRuntime:
    def __init__(self, directory, environments, diagnostics, origin):
        self.directory = Path(directory)/'browser'
        self.installer = KernelInstaller(self.directory/'kernel')
        self.environments, self.diagnostics, self.origin = environments, diagnostics, origin
        self.lock = threading.RLock()
        self.runs = {}
        self.processes, self.relays = {}, {}

    def state(self):
        with self.lock:
            for key, process in self.processes.items():
                if process.poll() is not None and self.runs[key]['status'] in ('running', 'blocked', 'failed'):
                    self.runs[key]['status'] = 'stopped'
                    relay = self.relays.pop(key, None)
                    if relay: threading.Thread(target=relay.close, daemon=True).start()
            return {'kernel': {**kernel.discover(self.directory/'kernel'), 'installation': self.installer.state()}, 'sessions': {profile['id']: session_state(self.directory/'profiles'/hashlib.sha256(profile['id'].encode()).hexdigest()[:32], profile['provider']) for profile in self.environments.read()['profiles']}, 'runs': [{**row, 'alive': bool(self.processes.get(key) and self.processes[key].poll() is None)} for key, row in self.runs.items()]}

    def update(self, key, **fields):
        with self.lock:
            self.runs[key].update(fields)

    def open(self, value):
        if not isinstance(value, dict) or set(value)-{'profile_id', 'account_id'}: raise ValueError('账号打开参数无效')
        settings = self.environments.read()
        account = next((row for row in settings['accounts'] if row['id'] == value.get('account_id')), None)
        key = account['profile_id'] if account else value.get('profile_id')
        with self.lock:
            process, run = self.processes.get(key), self.runs.get(key, {})
            if process and process.poll() is None and run.get('status') == 'running':
                if not focus_process(process.pid):
                    raise ValueError('环境仍在运行，但窗口未能置前，请从程序坞打开或先停止环境')
                return self.state()
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
        if profile['engine'] not in ('fingerprint-chromium', 'ccbaga'):
            raise ValueError('此环境需选择 Fingerprint Chromium 内核')
        selected = next((row for row in settings['proxies'] if row['id'] == profile['proxy_id']), None)
        if profile['proxy_id'] and not selected: raise ValueError('绑定的代理不存在')
        found = kernel.discover(self.directory/'kernel')
        if not found['available']: raise ValueError('未找到 Fingerprint Chromium 内核')
        with self.lock:
            process = self.processes.get(key)
            if (process and process.poll() is None) or self.runs.get(key, {}).get('status') == 'checking':
                raise ValueError('此环境正在运行或检查，请先停止后再启动')
            self.processes.pop(key, None)
            self.runs[key] = {'profile_id': key, 'account_id': account['id'] if account else '',
                              'name': profile['name'], 'status': 'checking', 'stage': '正在检查代理出口',
                              'checked_at': datetime.now(timezone.utc).isoformat(), 'checks': [],
                              'resolved': {}, 'browser_checks': [], 'error': ''}
        run = self.runs[key]
        threading.Thread(target=self._launch, args=(profile, selected, account, found, run), daemon=True).start()
        return self.state()

    def _launch(self, profile, proxy, account, found, run):
        key, ticket = profile['id'], None
        try:
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
            profile_dir = self.directory/'profiles'/hashlib.sha256(key.encode()).hexdigest()[:32]
            profile_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
            self._prepare_preferences(profile_dir)
            with self.lock:
                if run.get('cancelled'): return
                relay = ProxyRelay(url)
                self.relays[key] = relay
                ticket = self.diagnostics.start({'target': 'profile:'+key}, context={
                    'expected': {field: resolved[field] for field in ('locale', 'timezone')},
                    'launch': {'state': 'checking'},
                    'probe_options': {'managed': True, 'exit_source': resolved.get('probe_source', ''), 'exit': modes['exit_ip'] != 'off', 'webrtc': modes['webrtc'] != 'off',
                                      'fingerprint': modes['fingerprint'] != 'off'}})
                launch_url = self.origin+'/browser-check.html?ticket='+ticket['token']
                args = [found['path'], f'--user-data-dir={profile_dir}', f'--fingerprint={kernel.seed_number(profile["fingerprint_seed"])}',
                        '--fingerprint-platform='+{'darwin': 'macos', 'win32': 'windows'}.get(os.sys.platform, 'linux'),
                        f'--lang={resolved["locale"]}', f'--accept-lang={resolved["locale"]},{resolved["locale"].split("-")[0]}',
                        f'--timezone={resolved["timezone"]}', f'--proxy-server=http://127.0.0.1:{relay.server_port}',
                        '--disable-non-proxied-udp', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
                        '--dns-prefetch-disable',
                        '--disable-background-networking', '--disable-quic', '--no-first-run', '--no-default-browser-check',
                        '--disable-session-crashed-bubble', '--new-window', launch_url]
                environment = {name: content for name, content in os.environ.items()
                               if name in ('HOME', 'PATH', 'TMPDIR', 'SYSTEMROOT', 'WINDIR', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR')}
                environment['TZ'] = resolved['timezone']
                with (profile_dir/'browser.log').open('ab') as log:
                    process = subprocess.Popen(args, env=environment, stdin=subprocess.DEVNULL, stdout=log, stderr=log)
                self.processes[key] = process
                self.update(key, stage='正在读取目标浏览器实测结果', pid=process.pid)
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
            allowed = not blocked(checks)
            result = {'state': 'allowed' if allowed else 'blocked', 'checks': checks,
                      'next_url': ('https://claude.ai/new' if account['provider'] == 'claude' else 'https://chatgpt.com/') if account and allowed else ''}
            with self.lock:
                if run.get('cancelled'): return
                if allowed:
                    relay.released = True
                    if next_baseline:
                        temporary = baseline_file.with_suffix('.tmp')
                        temporary.write_text(json.dumps(next_baseline))
                        temporary.replace(baseline_file)
                self.diagnostics.set_launch(ticket['token'], result)
                self.update(key, status='running' if allowed else 'blocked',
                            stage='已允许启动' if allowed else '强制启动检查未通过', checks=checks,
                            browser_checks=report['checks'], checked_at=report['checked_at'])
        except Exception as error:
            if run.get('cancelled'): return
            self.update(key, status='failed', stage='启动未完成', error=str(error))
            if ticket:
                self.diagnostics.set_launch(ticket['token'], {'state': 'failed', 'error': str(error)})
            relay = self.relays.pop(key, None)
            if relay: relay.close()

    def _prepare_preferences(self, directory):
        # Restore only the check page before the account domain is released.
        path = directory/'Default/Preferences'
        value = json.loads(path.read_text()) if path.exists() else {}
        value['network_prediction_options'] = 2
        value.setdefault('session', {})['restore_on_startup'] = 5
        value['session']['startup_urls'] = []
        value.setdefault('profile', {})['exit_type'] = 'Normal'
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(value))
        temporary.replace(path)

    def stop(self, key):
        forced = False
        with self.lock:
            if key not in self.runs: raise ValueError('环境尚未启动')
            self.runs[key]['cancelled'] = True
            process = self.processes.get(key)
        if process and process.poll() is None:
            process.terminate()
            try: process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                forced = True
                process.kill()
                process.wait(timeout=5)
        relay = self.relays.pop(key, None)
        if relay: relay.close()
        self.update(key, status='stopped', stage='浏览器未响应退出，已结束此环境进程' if forced else '已停止')
        return self.state()

    def ensure_mutable(self, value):
        if not isinstance(value, dict): raise ValueError('环境配置格式无效')
        settings = self.environments.read()
        collection = value.get('collection')
        item = value.get('item')
        key = value.get('id') if value.get('action') == 'delete' else item.get('id') if isinstance(item, dict) else None
        with self.lock:
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
