"""Hand a user-pasted App login URL to the account's owned browser."""
import threading
import time
from urllib.parse import urlsplit
from uuid import uuid4
from .focus import focus_process


def login_url(value):
    if not isinstance(value, str): raise ValueError('请粘贴完整登录链接')
    url = value.strip()
    if not url or len(url) > 16384 or any(char.isspace() or ord(char) < 32 for char in url):
        raise ValueError('请从浏览器地址栏复制完整登录链接')
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError:
        raise ValueError('登录链接格式不正确，请重新复制完整地址') from None
    if (parsed.scheme != 'https' or parsed.hostname not in {'claude.ai', 'claude.com', 'accounts.google.com'}
            or parsed.username is not None or parsed.password is not None or port not in (None, 443)):
        raise ValueError('请使用 Claude 或 Google 官方页面的 HTTPS 登录链接')
    return url


class AppLogin:
    def __init__(self, environments, app, browser):
        self.environments, self.app, self.browser = environments, app, browser
        self.lock = threading.RLock()
        self.jobs = {}

    def _account(self, key):
        settings = self.environments.read()
        account = next((row for row in settings['accounts'] if row['id'] == key), None)
        if not account or account['provider'] != 'claude': raise ValueError('请选择 Claude 账号')
        profile = next((row for row in settings['profiles'] if row['id'] == account['profile_id']), None)
        if not profile or profile['provider'] != 'claude': raise ValueError('请先为账号绑定 Claude 浏览器环境')
        if not any(row['id'] == account.get('app_profile_id') for row in settings['app_profiles']):
            raise ValueError('请先为账号绑定 Claude App 环境')
        return account, profile

    def _app_process(self, account, expected=None):
        key = account['app_profile_id']
        process, run = self.app.processes.get(key), self.app.runs.get(key, {})
        if (not process or process.poll() is not None or run.get('status') != 'running'
                or (expected is not None and process is not expected)):
            raise ValueError('原 Claude App 已退出或切换；请重新打开此账号的 App，发起登录并复制新链接')
        return process

    def open(self, value):
        if not isinstance(value, dict) or set(value) != {'account_id', 'url'}:
            raise ValueError('请选择账号并粘贴登录链接')
        url = login_url(value['url'])
        account, profile = self._account(value['account_id'])
        with self.lock, self.app.lock:
            process = self._app_process(account)
            if any(row['account_id'] == account['id'] and row['state'] == 'waiting' for row in self.jobs.values()):
                raise ValueError('此账号的登录链接正在打开，请稍候')
            self.jobs = {key: row for key, row in self.jobs.items()
                         if row['state'] == 'waiting' or time.monotonic()-row['created'] < 600}
            job = {'id': str(uuid4()), 'account_id': account['id'], 'account_name': account['name'],
                   'browser_name': profile['name'], 'state': 'waiting', 'stage': '正在准备账号绑定的浏览器',
                   'error': '', 'created': time.monotonic()}
            self.jobs[job['id']] = job
        threading.Thread(target=self._open, args=(job, account, process, url), daemon=True).start()
        return self.read(job['id'])

    def read(self, key):
        with self.lock:
            if key not in self.jobs: raise ValueError('登录引导已结束，请重新开始')
            return {name: value for name, value in self.jobs[key].items() if name != 'created'}

    def cancel(self, value):
        if not isinstance(value, dict) or set(value) != {'id'}: raise ValueError('请选择登录引导')
        with self.lock:
            job = self.jobs.get(value['id'])
            if job and job['state'] == 'waiting': job.update(state='cancelled', stage='已取消打开登录链接')
        return self.read(value['id'])

    def _open(self, job, account, app_process, url):
        key = account['profile_id']
        try:
            with self.lock:
                if job['state'] != 'waiting': return
                with self.browser.lock:
                    process, run = self.browser.processes.get(key), self.browser.runs.get(key, {})
                    if run.get('status') != 'checking' and not (
                            run.get('status') == 'running' and process and process.poll() is None):
                        if process and process.poll() is None: self.browser.stop(key)
                        self.browser.launch({'profile_id': key})
                    browser_run = self.browser.runs[key]
            deadline = time.monotonic()+180
            while time.monotonic() < deadline:
                with self.lock:
                    if job['state'] != 'waiting': return
                    with self.app.lock: self._app_process(account, app_process)
                    with self.browser.lock:
                        run = self.browser.runs.get(key, {})
                        if run is not browser_run: raise ValueError('浏览器环境已重新启动，请重新提交登录链接')
                        job['stage'] = run.get('stage', '正在等待浏览器启动检查')
                        if run.get('status') == 'running': break
                        if run.get('status') != 'checking':
                            failures = [row['title'] for row in run.get('checks', [])+run.get('browser_checks', [])
                                        if row.get('policy') == 'block' and row.get('state') != 'pass']
                            raise ValueError(run.get('error') or '浏览器未通过启动检查：'+('、'.join(failures) or job['stage']))
                time.sleep(.25)
            else: raise ValueError('浏览器启动检查超时，请检查环境后重试')
            with self.lock, self.app.lock, self.browser.lock:
                if job['state'] != 'waiting': return
                self._app_process(account, app_process)
                current, _ = self._account(account['id'])
                if any(current.get(field) != account.get(field) for field in ('profile_id', 'app_profile_id')):
                    raise ValueError('账号绑定的环境已变更，请重新开始登录')
                process = self.browser.processes.get(key)
                if (self.browser.runs.get(key) is not browser_run or browser_run['status'] != 'running'
                        or not process or process.poll() is not None or key not in self.browser.controls):
                    raise ValueError('绑定的浏览器已关闭，请重新提交登录链接')
                self.browser.controls[key].open(url)
                focus_process(process.pid)
                job.update(state='opened', stage='登录链接已在绑定浏览器中打开')
        except Exception as error:
            with self.lock:
                if job['state'] == 'waiting': job.update(state='failed', stage='登录链接未打开', error=str(error))
