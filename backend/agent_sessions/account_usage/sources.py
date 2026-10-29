"""Query only the browser or Code login belonging to the selected account."""
import json
from urllib.parse import quote, urlsplit
from agent_sessions.browser.gates import blocked
from agent_sessions.browser.preflight import inspect
from .credentials import read as read_token
from .models import UsageError, normalize
from .transport import checked, oauth_json


def verify_email(account, email):
    expected = account['name'].strip()
    if '@' in expected and (not isinstance(email, str) or email.casefold() != expected.casefold()):
        raise UsageError('blocked', '当前环境登录的账号与所选账号不一致，请先确认登录身份')


def browser_json(control, session, path):
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
    return checked(value), value.get('active_org', '')


class UsageSources:
    def __init__(self, browser, app, proxy_manager):
        self.browser, self.app, self.proxy_manager = browser, app, proxy_manager

    def fetch(self, account, settings, organization=''):
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
        if not profile: raise UsageError('requires_browser', '打开此账号的独立浏览器并登录后，即可查询用量')
        self.app.identity.verify(settings, 'app_profiles', key)
        token = read_token(self.app.profile_directory(key)/'claude-code')
        proxy = next((row for row in settings['proxies'] if row['id'] == profile.get('proxy_id')), None)
        if not proxy: raise UsageError('blocked', '请先为 App 环境绑定专用代理，再查询用量')
        self.proxy_manager.ensure(proxy)
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
        result = normalize(oauth_json('/api/oauth/usage', token, proxy['url']))
        return {**result, 'source': 'oauth', 'source_label': 'App 内 Claude Code', 'identity': email or '',
                'organization_id': '', 'organization_name': '', 'organizations': []}

    def web(self, account, control, organization):
        targets = control.command('Target.getTargets')['targetInfos']
        target = next((row for row in targets if row['type'] == 'page' and urlsplit(row['url']).scheme == 'https'
                       and urlsplit(row['url']).hostname == 'claude.ai'), None)
        if not target: raise UsageError('requires_browser', '请在此账号的独立浏览器中打开 Claude 页面后查询')
        with control.lock: item = control.sessions.get(target['targetId'])
        if not item or not item['ready'].is_set(): raise UsageError('error', '浏览器管理连接尚未就绪，请稍后刷新')
        identity, _ = browser_json(control, item['session'], '/api/account')
        email = identity.get('email_address') if isinstance(identity, dict) else None
        verify_email(account, email)
        organizations, active = browser_json(control, item['session'], '/api/organizations')
        if not isinstance(organizations, list): raise UsageError('unavailable', '未取得账号的组织列表')
        choices = [{'id': row['uuid'], 'name': row['name'] if isinstance(row.get('name'), str) and row['name'] else row['uuid']}
                   for row in organizations if isinstance(row, dict) and isinstance(row.get('uuid'), str)]
        selected = next((row for row in choices if row['id'] == (organization or active)), None)
        if organization and not selected: raise UsageError('organization_required', '所选组织不属于当前登录账号', organizations=choices)
        if not selected and len(choices) == 1: selected = choices[0]
        if not selected: raise UsageError('organization_required', '请选择需要查看用量的组织', organizations=choices)
        payload, _ = browser_json(control, item['session'], '/api/organizations/'+quote(selected['id'], safe='')+'/usage')
        return {**normalize(payload), 'source': 'browser', 'source_label': '独立浏览器', 'identity': email or '',
                'organization_id': selected['id'], 'organization_name': selected['name'], 'organizations': choices}
