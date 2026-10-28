"""Claude cookies and identity verification inside the owned browser's network context."""
import time
from .session_state import NAMES

IDENTITY = """(async () => {
  if (location.origin !== 'https://claude.ai') return {};
  try {
    const response = await fetch('/api/account', {
      credentials: 'include', cache: 'no-store',
      headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(5000),
    });
    const json = response.headers.get('content-type')?.includes('application/json');
    if (!json) return {challenge: response.status === 403};
    const account = await response.json();
    if (!response.ok) return {
      status: response.status, rejected: [401, 403].includes(response.status),
      code: account.error?.details?.error_code || '',
    };
    return typeof account.email_address === 'string' && account.uuid
      ? {email: account.email_address, uuid: account.uuid} : {};
  } catch { return {}; }
})()"""


class WebSession:
    def __init__(self, control):
        self.control = control

    def cookies(self):
        return [row for row in self.control.command('Storage.getCookies')['cookies']
                if row['name'] in NAMES and
                (row['domain'].lstrip('.') == 'claude.ai' or row['domain'].endswith('.claude.ai'))]

    def clear(self):
        rows = [{'name': row['name'], 'value': '', 'domain': row['domain'],
                 'path': row['path'], 'secure': row['secure'], 'expires': 1} for row in self.cookies()]
        if rows: self.control.command('Storage.setCookies', {'cookies': rows})

    def replace(self, secret):
        self.clear()
        self.control.command('Storage.setCookies', {'cookies': [{
            'name': 'sessionKey', 'value': secret, 'domain': '.claude.ai', 'path': '/',
            'secure': True, 'httpOnly': True, 'sameSite': 'Lax', 'expires': time.time()+28*86400}]})

    def restore(self, cookies):
        self.clear()
        rows = []
        for cookie in cookies or []:
            row = {key: cookie[key] for key in ('name', 'value', 'domain', 'path', 'secure', 'httpOnly', 'sameSite') if key in cookie}
            if not cookie.get('session'): row['expires'] = cookie['expires']
            rows.append(row)
        if rows: self.control.command('Storage.setCookies', {'cookies': rows})

    def identity(self, target):
        with self.control.lock:
            item = self.control.sessions.get(target)
        if not item or not item['ready'].is_set(): return {}
        try:
            result = self.control.command('Runtime.evaluate', {
                'expression': IDENTITY, 'awaitPromise': True, 'returnByValue': True}, item['session'])
        except ValueError:
            if self.control.closed: raise
            return {}
        return result.get('result', {}).get('value') or {}
