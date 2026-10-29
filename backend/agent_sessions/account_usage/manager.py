"""Coalesce quota reads and retain the last successful account-bound result."""
import hashlib
import json
from pathlib import Path
import threading
import time
from .models import UsageError
from .sources import UsageSources

MIN_REFRESH = 180
CACHE_TTL = 300


class AccountUsage:
    def __init__(self, directory, environments, browser, app, proxies):
        self.path = Path(directory)/'account-usage.json'
        self.environments = environments
        self.sources = UsageSources(browser, app, proxies)
        self.lock, self.closed = threading.RLock(), False
        try:
            value = json.loads(self.path.read_text()) if self.path.exists() else {}
            self.entries = value.get('entries', {}) if isinstance(value, dict) else {}
            if not isinstance(self.entries, dict): self.entries = {}
            self.entries = {key: {**row, 'refreshing': False} for key, row in self.entries.items() if isinstance(row, dict)}
        except (ValueError, OSError): self.entries = {}

    def context(self, key):
        settings = self.environments.read()
        account = next((row for row in settings['accounts'] if row['id'] == key), None)
        if not account or account['provider'] != 'claude': raise ValueError('请选择 Claude 账号')
        profiles = [row for row in settings['profiles']+settings['app_profiles']
                    if row['id'] in (account.get('profile_id'), account.get('app_profile_id'))]
        proxies = [row for row in settings['proxies'] if any(profile['proxy_id'] == row['id'] for profile in profiles)]
        binding = hashlib.sha256(json.dumps([account, profiles, proxies], sort_keys=True).encode()).hexdigest()
        return account, settings, binding

    def entry(self, key, binding):
        row = self.entries.get(key)
        if not row or row.get('binding') != binding:
            row = {'binding': binding, 'status': 'idle', 'refreshing': False, 'updated_at': None,
                   'next_refresh_at': 0, 'error': '', 'windows': [], 'extra_usage': None,
                   'source': '', 'source_label': '', 'organizations': [], 'organization_id': '', 'organization_name': ''}
            self.entries[key] = row
        return row

    def read(self, key):
        _, _, binding = self.context(key)
        with self.lock:
            row = self.entry(key, binding)
            return {name: value for name, value in row.items() if name not in ('binding', 'failures')} | {
                'account_id': key, 'can_refresh': not row['refreshing'] and time.time() >= row['next_refresh_at'],
                'stale': not row['updated_at'] or time.time()-row['updated_at'] >= CACHE_TTL}

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
            threading.Thread(target=self._fetch, args=(key, account, settings, binding, organization), daemon=True).start()
            return self.read(key)

    def _fetch(self, key, account, settings, binding, organization):
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
                if error.state in ('requires_browser', 'login_required', 'organization_required'): delay = 0
                if error.state == 'rate_limited': delay = max(300, min(86400, error.retry_after), delay)
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
