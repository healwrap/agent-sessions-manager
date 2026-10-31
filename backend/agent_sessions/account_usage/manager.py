"""Coalesce quota reads and retain the last successful account-bound result."""
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
import threading
import time
from .models import UsageError
from .sources import UsageSources
from .benchmarks import QuotaBenchmarks
from .oauth_authorization import UsageAuthorization

MIN_REFRESH = 180
CACHE_TTL = 300


class AccountUsage:
    def __init__(self, directory, environments, browser, app, proxies):
        self.path = Path(directory)/'account-usage.json'
        self.environments = environments
        self.authorization = UsageAuthorization(directory, environments, browser, app, proxies)
        self.sources = UsageSources(browser, app, proxies, self.authorization)
        self.authorization.on_verified = lambda key: self.refresh({'account_id': key})
        self.benchmarks = QuotaBenchmarks(directory)
        self.workers = ThreadPoolExecutor(max_workers=2, thread_name_prefix='account-usage')
        self.lock, self.closed = threading.RLock(), False
        try:
            value = json.loads(self.path.read_text()) if self.path.exists() else {}
            self.entries = value.get('entries', {}) if isinstance(value, dict) else {}
            if not isinstance(self.entries, dict): self.entries = {}
            self.entries = {key: {**row, 'refreshing': False} for key, row in self.entries.items() if isinstance(row, dict)}
        except (ValueError, OSError): self.entries = {}

    def context(self, key, settings=None):
        settings = settings if settings is not None else self.environments.read()
        account = next((row for row in settings['accounts'] if row['id'] == key), None)
        if not account or account['provider'] != 'claude': raise ValueError('请选择 Claude 账号')
        profiles = [row for row in settings['profiles']+settings['app_profiles']
                    if row['id'] in (account.get('profile_id'), account.get('app_profile_id'))]
        from agent_sessions.network.fallback_plan import chain
        roots = {profile['proxy_id'] for profile in profiles if profile.get('proxy_id')}
        relevant = {row['id'] for key in roots for row in chain(settings['proxies'], key)}
        proxies = [row for row in settings['proxies'] if row['id'] in relevant]
        selection = self.sources.network.fallbacks.binding(roots)
        identity = {field: value for field, value in account.items() if field != 'usage_plan'}
        binding = hashlib.sha256(json.dumps([identity, profiles, proxies, selection, self.authorization.revision(key)], sort_keys=True).encode()).hexdigest()
        return account, settings, binding

    def entry(self, key, binding):
        row = self.entries.get(key)
        if not row or row.get('binding') != binding:
            row = {'binding': binding, 'status': 'idle', 'refreshing': False, 'updated_at': None,
                   'next_refresh_at': 0, 'error': '', 'windows': [], 'extra_usage': None,
                   'source': '', 'source_label': '', 'organizations': [], 'organization_id': '', 'organization_name': ''}
            self.entries[key] = row
        return row

    def read(self, key, settings=None):
        account, _, binding = self.context(key, settings)
        with self.lock:
            row = self.entry(key, binding)
            reset_due = any(window.get('resets_at') and (row['updated_at'] or 0) < datetime.fromisoformat(window['resets_at']).timestamp() <= time.time()
                            for window in row['windows'])
            return {name: value for name, value in row.items() if name not in ('binding', 'failures')} | {
                'account_id': key, 'can_refresh': not row['refreshing'] and time.time() >= row['next_refresh_at'],
                'plan': account.get('usage_plan') or row.get('plan', ''),
                'plan_source': 'manual' if account.get('usage_plan') else 'claude',
                'authorization': self.authorization.state(key),
                'stale': not row['updated_at'] or reset_due or time.time()-row['updated_at'] >= CACHE_TTL}

    def authorize(self, value):
        try: return self.authorization.start(value)
        except UsageError as error: raise ValueError(str(error)) from None

    def authorize_complete(self, value):
        return self.authorization.complete(value)

    def authorize_cancel(self, value):
        return self.authorization.cancel(value)

    def overview(self):
        settings = self.environments.read()
        self.benchmarks.refresh(automatic=True)
        return {'items': [self.read(account['id'], settings) for account in settings['accounts']
                          if account['provider'] == 'claude'], 'benchmarks': self.benchmarks.read()}

    def refresh_all(self, value):
        if value != {}: raise ValueError('批量刷新参数应为空对象')
        for account in self.environments.read()['accounts']:
            if account['provider'] == 'claude': self.refresh({'account_id': account['id']})
        return self.overview()

    def refresh(self, value):
        if not isinstance(value, dict) or not {'account_id'} <= set(value) <= {'account_id', 'organization_id'}:
            raise ValueError('用量查询参数无效')
        key, organization = value['account_id'], value.get('organization_id', '')
        if not isinstance(key, str) or not isinstance(organization, str) or len(organization) > 100:
            raise ValueError('请选择账号与组织')
        account, settings, binding = self.context(key)
        with self.lock:
            row = self.entry(key, binding)
            if self.closed or row['refreshing'] or time.time() < row['next_refresh_at']: return self.read(key)
            row.update(refreshing=True, error='')
            organization = organization or row.get('organization_id', '')
            self.workers.submit(self._fetch, key, account, settings, binding, organization)
            return self.read(key)

    def _fetch(self, key, account, settings, binding, organization):
        if self.closed: return
        result, error = None, None
        try: result = self.sources.fetch(account, settings, organization)
        except UsageError as reason: error = reason
        except (ValueError, OSError): error = UsageError('error', '账号环境暂不可读取用量，请确认登录和代理状态后重试')
        except Exception: error = UsageError('error', '用量读取未完成，请稍后重试')
        try: current_binding = self.context(key)[2]
        except ValueError: current_binding = ''
        with self.lock:
            if self.closed or current_binding != binding: return
            row = self.entry(key, binding)
            if result:
                row.update(result, status='ready', refreshing=False, error='', failures=0,
                           updated_at=time.time(), next_refresh_at=time.time()+MIN_REFRESH)
            else:
                failures = row.get('failures', 0)+1
                delay = min(600, 30*2**min(failures-1, 5))
                if error.state in ('blocked', 'unavailable'): delay = 15
                if error.state in ('requires_browser', 'login_required', 'organization_required', 'authorization_required'): delay = 0
                if error.state == 'rate_limited': delay = max(300, min(86400, error.retry_after), delay)
                row.update(error.metadata)
                if error.state in ('account_disabled', 'organization_disabled'):
                    row['health'] = {'state': 'disabled' if error.state == 'account_disabled' else 'organization_disabled',
                                     'checked_at': time.time(), 'message': str(error)}
                if error.state == 'login_required':
                    row['health'] = {'state': 'unknown', 'checked_at': time.time(), 'message': str(error)}
                row.update(status=error.state, refreshing=False, error=str(error), failures=failures,
                           next_refresh_at=time.time()+delay)
                if error.organizations: row['organizations'] = error.organizations
            self._save()

    def _save(self):
        accounts = {row['id'] for row in self.environments.read()['accounts']}
        self.entries = {key: row for key, row in self.entries.items() if key in accounts}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix('.tmp')
        temporary.write_text(json.dumps({'entries': self.entries}, ensure_ascii=False, indent=2))
        temporary.chmod(0o600)
        temporary.replace(self.path)

    def close(self):
        with self.lock: self.closed = True
        self.authorization.close()
        self.workers.shutdown(wait=False, cancel_futures=True)
        self.benchmarks.close()
