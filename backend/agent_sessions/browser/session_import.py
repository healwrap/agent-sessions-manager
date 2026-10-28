"""Import a Claude web session only into its account's gated, owned browser."""
import re
import threading
import time
from uuid import uuid4
from agent_sessions.desktop_client.focus import focus_process
from .web_session import WebSession


def session_input(raw, email=''):
    if not isinstance(raw, str) or not 1 <= len(raw) <= 16384:
        raise ValueError('请粘贴 sessionKey')
    parts = raw.strip().split('----')
    if len(parts) == 3:
        email = email or parts[0].strip()
        raw = parts[2]
    raw = raw.strip().strip('\"\'')
    if raw.startswith('sessionKey='): raw = raw[len('sessionKey='):]
    raw = raw.removesuffix(';')
    if not re.fullmatch(r'sk-ant-sid[0-9]+-[A-Za-z0-9_-]{32,4096}', raw):
        raise ValueError('sessionKey 格式不正确，请复制完整值')
    if not isinstance(email, str) or (email and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email.strip())):
        raise ValueError('账号邮箱格式不正确')
    return raw, email.strip()


class SessionImport:
    def __init__(self, environments, browser):
        self.environments, self.browser = environments, browser
        self.lock, self.jobs = threading.RLock(), {}

    def _account(self, key):
        settings = self.environments.read()
        account = next((row for row in settings['accounts'] if row['id'] == key), None)
        if not account or account['provider'] != 'claude': raise ValueError('请选择 Claude 账号')
        profile = next((row for row in settings['profiles'] if row['id'] == account['profile_id']), None)
        if not profile or profile['provider'] != 'claude': raise ValueError('请先绑定 Claude 浏览器环境')
        return account, profile

    def start(self, value):
        if not isinstance(value, dict) or set(value)-{'account_id', 'session_key', 'email'}:
            raise ValueError('会话导入参数无效')
        secret, email = session_input(value.get('session_key'), value.get('email', ''))
        account, profile = self._account(value.get('account_id'))
        if not email and '@' in account['name']: email = account['name']
        with self.lock:
            if any(row['profile_id'] == profile['id'] and row['state'] == 'waiting' for row in self.jobs.values()):
                raise ValueError('此浏览器正在导入会话，请等待完成')
            self.jobs = {key: row for key, row in self.jobs.items()
                         if row['state'] == 'waiting' or time.monotonic()-row['_created'] < 600}
            job = {'id': str(uuid4()), 'profile_id': profile['id'], 'account_id': account['id'],
                   'state': 'waiting', 'stage': '正在检查账号绑定的浏览器', 'error': '', 'email': '',
                   '_created': time.monotonic(), '_cancelled': False}
            self.jobs[job['id']] = job
        threading.Thread(target=self._import, args=(job, secret, email), daemon=True).start()
        return self.read(job['id'])

    def read(self, key):
        with self.lock:
            if key not in self.jobs: raise ValueError('会话导入已结束，请重新开始')
            return {name: value for name, value in self.jobs[key].items() if not name.startswith('_')}

    def cancel(self, value):
        if not isinstance(value, dict) or set(value) != {'id'}: raise ValueError('请选择会话导入任务')
        with self.lock:
            job = self.jobs.get(value['id'])
            if job and job['state'] == 'waiting':
                job.update(_cancelled=True, stage='正在取消会话导入')
        return self.read(value['id'])

    def _ready(self, job, run=None):
        if job['_cancelled']: raise ValueError('已取消会话导入')
        current, _ = self._account(job['account_id'])
        if current['profile_id'] != job['profile_id']: raise ValueError('账号绑定的浏览器已变更')
        state = self.browser.runs.get(job['profile_id'], {})
        if run is not None and state is not run: raise ValueError('浏览器已重新启动，请重新导入')
        return state

    def _import(self, job, secret, email):
        session, previous, imported = None, None, False
        key = job['profile_id']
        try:
            with self.lock, self.browser.lock:
                run = self._ready(job)
                process = self.browser.processes.get(key)
                if run.get('status') != 'checking' and not (
                        run.get('status') == 'running' and process and process.poll() is None):
                    if process and process.poll() is None: self.browser.stop(key)
                    # Do not navigate to the account until after the new cookie is installed.
                    self.browser.launch({'profile_id': key})
                run = self.browser.runs[key]
            deadline = time.monotonic()+210
            while time.monotonic() < deadline:
                with self.lock, self.browser.lock:
                    state = self._ready(job, run)
                    job['stage'] = state.get('stage', '正在等待启动检查')
                    if state.get('status') == 'running': break
                    if state.get('status') != 'checking':
                        raise ValueError(state.get('error') or state.get('stage') or '浏览器未通过启动检查')
                time.sleep(.25)
            else: raise ValueError('浏览器启动检查超时')
            with self.lock, self.browser.lock:
                self._ready(job, run)
                process = self.browser.processes.get(key)
                if not process or process.poll() is not None or key not in self.browser.controls:
                    raise ValueError('绑定的浏览器已关闭，请重新导入')
                session = WebSession(self.browser.controls[key])
                previous = session.cookies()
                imported = True
                session.replace(secret)
                secret = ''
                target = session.control.open('https://claude.ai/new')
                job['stage'] = '正在核对 Claude 账号'
                focus_process(process.pid)
            deadline = time.monotonic()+120
            while time.monotonic() < deadline:
                with self.lock, self.browser.lock:
                    state = self._ready(job, run)
                    if state.get('status') != 'running' or process.poll() is not None:
                        raise ValueError('浏览器已关闭，尚未完成会话验证')
                result = session.identity(target)
                with self.lock:
                    self._ready(job, run)
                    actual = result.get('email', '')
                    if actual:
                        if email and actual.casefold() != email.casefold():
                            raise ValueError('实际登录邮箱为 '+actual+'，与填写邮箱不一致')
                        job.update(state='verified', stage='已登录 '+actual, email=actual)
                        return
                    if result.get('rejected'):
                        if result.get('code') == 'account_session_invalid':
                            raise ValueError('登录会话已失效，请重新登录 Claude 后获取新的 sessionKey')
                        raise ValueError('Claude 未接受此会话（HTTP '+str(result['status'])+'），请重新获取 sessionKey')
                    job['stage'] = ('请在浏览器中完成网站验证，完成后会自动继续' if result.get('challenge')
                                    else '正在等待 Claude 返回账号信息')
                time.sleep(1)
            raise ValueError('尚未取得 Claude 账号信息，请检查浏览器页面后重试')
        except Exception as error:
            rollback_error = ''
            if imported and session:
                try: session.restore(previous)
                except Exception: rollback_error = '；浏览器已断开，无法恢复原会话'
            with self.lock:
                job.update(state='cancelled' if job['_cancelled'] else 'failed',
                           stage='已取消会话导入' if job['_cancelled'] else '会话导入未完成', error=str(error)+rollback_error)
