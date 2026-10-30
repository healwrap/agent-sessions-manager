"""Query only the browser or Code login belonging to the selected account."""
import json
import time
from urllib.parse import quote, urlsplit
from agent_sessions.browser.gates import blocked
from agent_sessions.browser.preflight import inspect
from .credentials import read as read_token
from .models import UsageError, normalize, verify_email
from .transport import checked, oauth_json
from .benchmark_data import subscription_plan


def with_metadata(payload, metadata):
    try: return {**normalize(payload), **metadata}
    except UsageError as error:
        error.metadata = metadata
        raise


def browser_json(control, session, path, metadata=None):
    expression = '''(async () => {
      if (location.origin !== 'https://claude.ai') return {status: 0};
      const response = await fetch(PATH, {credentials:'include', cache:'no-store',
        redirect:'error', headers:{Accept:'application/json'}, signal:AbortSignal.timeout(5000)});
      const text = await response.text();
      let data = null;
      if (text.length <= 524288 && response.headers.get('content-type')?.includes('application/json')) {
        try { data = JSON.parse(text); } catch {}
      }
      const org = document.cookie.split('; ').find(row => row.startsWith('lastActiveOrg='));
      return {status:response.status, data, retry_after:response.headers.get('Retry-After'),
        active_org:org ? decodeURIComponent(org.slice(14)) : ''};
    })()'''.replace('PATH', json.dumps(path))
    result = control.command('Runtime.evaluate', {'expression': expression, 'awaitPromise': True,
                                                  'returnByValue': True}, session)
    if result.get('exceptionDetails'): raise UsageError('error', '账号浏览器读取用量失败，请检查页面连接')
    value = result.get('result', {}).get('value') or {}
    try: return checked(value), value.get('active_org', '')
    except UsageError as error:
        error.metadata = metadata or {}
        raise


class UsageSources:
    def __init__(self, browser, app, network, authorization=None):
        self.browser, self.app, self.network = browser, app, network
        self.authorization = authorization

    def fetch(self, account, settings, organization=''):
        if self.authorization and self.authorization.has(account['id']):
            payload, metadata = self.authorization.fetch(account['id'])
            return with_metadata(payload, metadata)
        key = account.get('profile_id')
        with self.browser.lock:
            control = self.browser.controls.get(key)
            process = self.browser.processes.get(key)
            run = self.browser.runs.get(key, {})
            relay = self.browser.relays.get(key)
            alive = process and process.poll() is None
            ready = alive and control and not control.closed and run.get('status') == 'running' and relay and relay.released
        if ready:
            profile = next(row for row in settings['profiles'] if row['id'] == key)
            if not profile.get('proxy_id'): raise UsageError('blocked', '请先为浏览器环境绑定专用代理，再查询用量')
            self.browser.identity.verify(settings, 'profiles', key)
            return self.web(account, control, organization)
        key = account.get('app_profile_id')
        profile = next((row for row in settings['app_profiles'] if row['id'] == key), None)
        if not profile:
            raise UsageError('authorization_required', '请先授权后台查询，之后无需保持浏览器打开')
        self.app.identity.verify(settings, 'app_profiles', key)
        try: token = read_token(self.app.profile_directory(key)/'claude-code')
        except UsageError as error:
            if error.state in ('requires_browser', 'login_required'):
                raise UsageError('authorization_required', '请先授权后台查询，之后无需保持浏览器打开') from None
            raise
        proxy = next((row for row in settings['proxies'] if row['id'] == profile.get('proxy_id')), None)
        if not proxy: raise UsageError('blocked', '请先为 App 环境绑定专用代理，再查询用量')
        self.network.ensure(proxy)
        with self.app.lock:
            run = self.app.runs.get(key, {})
            relay = self.app.relays.get(key)
            live = self.app.processes.get(key)
            ready = live and live.poll() is None and run.get('status') == 'running' and relay and relay.released
        if not ready:
            _, checks = inspect(profile, proxy, browser=False)
            if blocked(checks): raise UsageError('blocked', '账号代理预检未通过，无法查询用量')
        identity = oauth_json('/api/oauth/profile', token, proxy['url'])
        info = identity.get('account') or identity
        email = info.get('email') or info.get('email_address')
        verify_email(account, email)
        metadata = {'source': 'oauth', 'source_label': 'App 内 Claude Code', 'identity': email or '',
                'plan': subscription_plan(identity),
                'organization_id': '', 'organization_name': '', 'organizations': [],
                'health': {'state': 'accessible', 'checked_at': time.time(), 'message': 'Claude 账号身份接口可访问'}}
        try: payload = oauth_json('/api/oauth/usage', token, proxy['url'])
        except UsageError as error:
            error.metadata = metadata
            raise
        return with_metadata(payload, metadata)

    def web(self, account, control, organization):
        # Startup checks release the relay before their page navigates to Claude.
        deadline = time.monotonic()+12
        while True:
            targets = control.command('Target.getTargets')['targetInfos']
            target = next((row for row in targets if row['type'] == 'page' and urlsplit(row['url']).scheme == 'https'
                           and urlsplit(row['url']).hostname == 'claude.ai'), None)
            if target or time.monotonic() >= deadline: break
            time.sleep(.3)
        if not target: raise UsageError('requires_browser', '请在此账号的独立浏览器中打开 Claude 页面后查询')
        with control.lock: item = control.sessions.get(target['targetId'])
        if not item or not item['ready'].is_set(): raise UsageError('error', '浏览器管理连接尚未就绪，请稍后刷新')
        identity, _ = browser_json(control, item['session'], '/api/account')
        email = identity.get('email_address') if isinstance(identity, dict) else None
        verify_email(account, email)
        metadata = {'source': 'browser', 'source_label': '独立浏览器', 'identity': email or '',
                    'health': {'state': 'accessible', 'checked_at': time.time(), 'message': 'Claude 账号身份接口可访问'}}
        organizations, active = browser_json(control, item['session'], '/api/organizations', metadata)
        if not isinstance(organizations, list): raise UsageError('unavailable', '未取得账号的组织列表', metadata=metadata)
        choices = [{'id': row['uuid'], 'name': row['name'] if isinstance(row.get('name'), str) and row['name'] else row['uuid']}
                   for row in organizations if isinstance(row, dict) and isinstance(row.get('uuid'), str)]
        selected = next((row for row in choices if row['id'] == (organization or active)), None)
        if organization and not selected: raise UsageError('organization_required', '所选组织不属于当前登录账号', organizations=choices, metadata=metadata)
        if not selected and len(choices) == 1: selected = choices[0]
        if not selected: raise UsageError('organization_required', '请选择需要查看用量的组织', organizations=choices, metadata=metadata)
        organization_info = next(row for row in organizations if row.get('uuid') == selected['id'])
        metadata.update(plan=subscription_plan(identity, organization_info), organization_id=selected['id'],
                        organization_name=selected['name'], organizations=choices)
        payload, _ = browser_json(control, item['session'], '/api/organizations/'+quote(selected['id'], safe='')+'/usage', metadata)
        return with_metadata(payload, metadata)
