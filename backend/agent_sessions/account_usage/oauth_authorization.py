"""Own one background usage authorization per account, separate from running clients."""
import hashlib
import json
import threading
import time
from uuid import uuid4
from agent_sessions.browser.gates import blocked
from agent_sessions.browser.preflight import inspect
from agent_sessions.desktop_client.focus import focus_process
from .benchmark_data import subscription_plan
from .models import UsageError, verify_email
from .oauth_protocol import begin, authorization_code, exchange, renew
from .oauth_store import OAuthStore
from .transport import oauth_json


class UsageAuthorization:
    def __init__(self, directory, environments, browser, app, proxies):
        self.store = OAuthStore(directory)
        self.environments, self.browser, self.app, self.proxies = environments, browser, app, proxies
        self.lock, self.jobs, self.closed = threading.RLock(), {}, False
        self.on_verified = lambda key: None

    def context(self, key, browser_required=False):
        settings = self.environments.read()
        account = next((row for row in settings['accounts'] if row['id'] == key), None)
        if not account or account['provider'] != 'claude': raise ValueError('请选择 Claude 账号')
        profile = next((row for row in settings['profiles'] if row['id'] == account['profile_id']), None)
        collection = 'profiles'
        if not profile and not browser_required:
            collection = 'app_profiles'
            profile = next((row for row in settings['app_profiles'] if row['id'] == account.get('app_profile_id')), None)
        if not profile: raise ValueError('请先为账号绑定独立浏览器环境')
        proxy = next((row for row in settings['proxies'] if row['id'] == profile.get('proxy_id')), None)
        if not proxy: raise UsageError('blocked', '请先为账号环境绑定专用代理，再授权后台查询')
        runtime = self.browser if collection == 'profiles' else self.app
        runtime.identity.verify(settings, collection, profile['id'])
        identity = {field: value for field, value in account.items() if field != 'usage_plan'}
        binding = hashlib.sha256(json.dumps([identity, profile, proxy], sort_keys=True).encode()).hexdigest()
        return account, profile, proxy, binding

    def route(self, key):
        account, profile, proxy, binding = self.context(key)
        self.proxies.ensure(proxy, None if proxy.get('kind') == 'clash' else profile['id'])
        _, checks = inspect(profile, proxy, browser=False)
        if blocked(checks): raise UsageError('blocked', '账号代理预检未通过，请检查环境后重试后台查询')
        return account, proxy['url'], binding

    def state(self, key):
        try: value = self.store.read(key)
        except UsageError as error: return {'state': 'login_required', 'email': '', 'error': str(error)}
        if not value: return {'state': 'none', 'email': '', 'error': ''}
        expired = value.get('expires_at', 0) <= time.time() and not value.get('refresh_token')
        return {'state': 'login_required' if value.get('requires_login') or expired else 'ready',
                'email': value.get('email', ''), 'error': value.get('error', '')}

    def has(self, key):
        return self.store.path(key).exists()

    def revision(self, key):
        try: return (self.store.read(key) or {}).get('authorization_id', '')
        except UsageError: return 'unreadable'

    def metadata(self, account, identity):
        if not isinstance(identity, dict): raise UsageError('login_required', 'Claude 未返回有效的授权账号身份')
        info = identity.get('account') or identity
        if not isinstance(info, dict): raise UsageError('login_required', 'Claude 未返回有效的授权账号身份')
        email = info.get('email') or info.get('email_address')
        verify_email(account, email)
        organization = identity.get('organization') or {}
        organization_id = organization.get('uuid') or ''
        organization_name = organization.get('name') or ''
        return {'source': 'oauth', 'source_label': '后台授权', 'identity': email,
                'plan': subscription_plan(identity), 'organization_id': organization_id,
                'organization_name': organization_name,
                'organizations': [{'id': organization_id, 'name': organization_name or organization_id}] if organization_id else [],
                'health': {'state': 'accessible', 'checked_at': time.time(), 'message': 'Claude 账号身份接口可访问'}}

    def _renew(self, key, value, proxy):
        try: value = renew(value, proxy)
        except UsageError as error:
            if error.state == 'login_required':
                self.store.write(key, {**value, 'requires_login': True, 'error': str(error)})
            raise
        self.store.write(key, value)
        return value

    def fetch(self, key):
        account, proxy, binding = self.route(key)
        with self.store.claim(key):
            value = self.store.read(key)
            if not value or value.get('requires_login'):
                raise UsageError('login_required', '请为此账号重新授权后台查询')
            verify_email(account, value.get('email'))
            if value['expires_at'] <= time.time()+60: value = self._renew(key, value, proxy)
            try: identity = oauth_json('/api/oauth/profile', value['access_token'], proxy)
            except UsageError as error:
                if error.state != 'login_required': raise
                value = self._renew(key, value, proxy)
                try: identity = oauth_json('/api/oauth/profile', value['access_token'], proxy)
                except UsageError as retry_error:
                    if retry_error.state == 'login_required':
                        self.store.write(key, {**value, 'requires_login': True, 'error': str(retry_error)})
                    raise
            metadata = self.metadata(account, identity)
            if metadata['identity'].casefold() != value['email'].casefold():
                raise UsageError('blocked', '后台授权的实际账号已变化，请重新授权')
            try: payload = oauth_json('/api/oauth/usage', value['access_token'], proxy)
            except UsageError as error:
                if error.state == 'login_required':
                    self.store.write(key, {**value, 'requires_login': True, 'error': str(error)})
                error.metadata = metadata
                raise
            if self.context(key)[3] != binding: raise UsageError('blocked', '账号环境已变更，请重新刷新用量')
            return payload, metadata

    def start(self, value):
        if not isinstance(value, dict) or set(value) != {'account_id'} or not isinstance(value['account_id'], str):
            raise ValueError('请选择需要授权的账号')
        account, profile, proxy, binding = self.context(value['account_id'], browser_required=True)
        if '@' not in account['name']:
            raise ValueError('请先在账号名称中填写登录邮箱，便于核对后台授权的账号')
        with self.lock:
            if self.closed: raise ValueError('应用正在退出')
            for job in self.jobs.values():
                if job['account_id'] == account['id'] and job['state'] in ('preparing', 'waiting', 'verifying'):
                    return self.read(job['id'])
            verifier, state, url = begin(account['name'])
            self.jobs = {key: row for key, row in self.jobs.items() if time.monotonic()-row['created'] < 900}
            job = {'id': str(uuid4()), 'account_id': account['id'], 'account_name': account['name'],
                   'profile_id': profile['id'], 'binding': binding, 'state': 'preparing',
                   'stage': '正在准备账号专用浏览器', 'error': '', 'created': time.monotonic(),
                   'verifier': verifier, 'oauth_state': state, 'url': url}
            self.jobs[job['id']] = job
        threading.Thread(target=self._open, args=(job,), daemon=True).start()
        return self.read(job['id'])

    def read(self, key):
        with self.lock:
            job = self.jobs.get(key)
            if not job: raise ValueError('授权已结束，请重新开始')
            if time.monotonic()-job['created'] >= 900 and job['state'] in ('preparing', 'waiting'):
                self._end(job, 'failed', '授权已超时，请重新开始')
            return {name: job.get(name, '') for name in ('id', 'account_id', 'account_name', 'state', 'stage', 'error')}

    def _end(self, job, state, message):
        job.update(state=state, stage=message, error=message if state == 'failed' else '',
                   verifier='', oauth_state='', url='')

    def _current(self, job):
        if self.closed or job['state'] not in ('preparing', 'waiting', 'verifying'):
            raise ValueError('本次授权已取消')
        context = self.context(job['account_id'], browser_required=True)
        if context[3] != job['binding']: raise ValueError('账号或代理配置已变化，请重新开始授权')
        return context

    def _open(self, job):
        try:
            with self.lock, self.browser.lock:
                self._current(job)
                key = job['profile_id']
                process, run = self.browser.processes.get(key), self.browser.runs.get(key, {})
                if run.get('status') != 'checking' and not (process and process.poll() is None and run.get('status') == 'running'):
                    if process and process.poll() is None: self.browser.stop(key)
                    self.browser.launch({'account_id': job['account_id']})
                expected_run = self.browser.runs[key]
            deadline = time.monotonic()+180
            while time.monotonic() < deadline:
                with self.lock, self.browser.lock:
                    self._current(job)
                    run = self.browser.runs.get(key)
                    if run is not expected_run: raise ValueError('账号浏览器已重新启动，请重新授权')
                    job['stage'] = run.get('stage', '正在等待浏览器启动检查')
                    if run.get('status') == 'running': break
                    if run.get('status') != 'checking': raise ValueError(run.get('error') or '浏览器未通过启动检查')
                time.sleep(.25)
            else: raise ValueError('浏览器启动检查超时，请检查环境后重新授权')
            with self.lock, self.browser.lock:
                self._current(job)
                process, relay = self.browser.processes.get(key), self.browser.relays.get(key)
                if not process or process.poll() is not None or not relay or not relay.released:
                    raise ValueError('账号浏览器已关闭，请重新授权')
                self.browser.controls[key].open(job['url'])
                focus_process(process.pid)
                job.update(state='waiting', stage='请在账号浏览器完成授权，并将授权码粘贴到这里')
        except Exception as error:
            with self.lock:
                if job['state'] == 'preparing': self._end(job, 'failed', str(error))

    def complete(self, value):
        if not isinstance(value, dict) or set(value) != {'id', 'code'} or not isinstance(value['id'], str):
            raise ValueError('请粘贴本次授权码')
        with self.lock:
            self.read(value['id'])
            job = self.jobs[value['id']]
            self._current(job)
            if job['state'] != 'waiting': raise ValueError('请先在账号浏览器中完成授权')
            code = authorization_code(value['code'], job['oauth_state'])
            job.update(state='verifying', stage='正在核对授权账号并连接后台查询', error='')
        threading.Thread(target=self._complete, args=(job, code), daemon=True).start()
        return self.read(job['id'])

    def _complete(self, job, code):
        try:
            with self.lock:
                self._current(job)
                verifier, state = job['verifier'], job['oauth_state']
            account, proxy, _ = self.route(job['account_id'])
            value = exchange(code, verifier, state, proxy)
            metadata = self.metadata(account, oauth_json('/api/oauth/profile', value['access_token'], proxy))
            with self.store.claim(account['id']), self.lock:
                self._current(job)
                self.store.write(account['id'], {**value, 'email': metadata['identity'], 'authorization_id': str(uuid4())})
                self._end(job, 'verified', '后台查询已授权，关闭浏览器后仍可刷新用量')
            self.on_verified(account['id'])
        except Exception as error:
            with self.lock:
                if job['state'] == 'verifying': self._end(job, 'failed', str(error))

    def cancel(self, value):
        if not isinstance(value, dict) or set(value) != {'id'} or not isinstance(value['id'], str):
            raise ValueError('请选择授权任务')
        with self.lock:
            self.read(value['id'])
            job = self.jobs[value['id']]
            if job['state'] in ('preparing', 'waiting', 'verifying'):
                self._end(job, 'cancelled', '已取消本次授权')
            return self.read(job['id'])

    def close(self):
        with self.lock:
            self.closed = True
            for job in self.jobs.values():
                if job['state'] in ('preparing', 'waiting', 'verifying'): self._end(job, 'cancelled', '应用已退出')
