"""PKCE authorization and refresh for the account's own background usage login."""
import base64
import hashlib
import hmac
import secrets
import time
from urllib.parse import parse_qs, urlencode, urlsplit
from .models import UsageError
from .transport import checked, proxy_response

CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
REDIRECT_URI = 'https://platform.claude.com/oauth/code/callback'
SCOPES = 'user:profile'


def begin(email):
    verifier, state = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    query = {'code': 'true', 'client_id': CLIENT_ID, 'response_type': 'code', 'redirect_uri': REDIRECT_URI,
             'scope': SCOPES, 'code_challenge': challenge, 'code_challenge_method': 'S256', 'state': state}
    if '@' in email: query['login_hint'] = email
    return verifier, state, 'https://claude.ai/oauth/authorize?'+urlencode(query)


def authorization_code(value, state):
    if not isinstance(value, str) or len(value) > 16384: raise ValueError('请粘贴本次授权码')
    value = value.strip()
    supplied_state = ''
    if value.startswith('https://'):
        parsed = urlsplit(value)
        if parsed.hostname != 'platform.claude.com' or parsed.path != '/oauth/code/callback':
            raise ValueError('请粘贴 Claude 授权结果中的授权码')
        query = parse_qs(parsed.query)
        code, supplied_state = query.get('code', [''])[0], query.get('state', [''])[0]
    else:
        code, separator, supplied_state = value.partition('#')
    if not code or any(char.isspace() or ord(char) < 32 for char in code):
        raise ValueError('授权码格式无效，请重新复制完整授权码')
    if supplied_state and not hmac.compare_digest(supplied_state, state):
        raise ValueError('授权码不属于本次授权，请重新开始')
    return code


def grant(body, proxy):
    result = proxy_response('platform.claude.com', '/v1/oauth/token', proxy, body={**body, 'client_id': CLIENT_ID})
    data = result['data']
    error = data.get('error') if isinstance(data, dict) else ''
    code = error.get('type', '') if isinstance(error, dict) else error
    if result['status'] in (400, 401, 403) and code in ('invalid_grant', 'invalid_token'):
        raise UsageError('login_required', '后台查询授权已失效，请重新授权')
    if result['status'] in (400, 401, 403) and code:
        description = data.get('error_description') or (error.get('message') if isinstance(error, dict) else '')
        raise UsageError('login_required', 'Claude 授权未完成：'+str(description or code))
    data = checked(result)
    if not isinstance(data, dict) or not isinstance(data.get('access_token'), str) or not data['access_token']:
        raise UsageError('login_required', 'Claude 未返回有效的后台查询授权')
    expiry = data.get('expires_in')
    if type(expiry) not in (int, float) or not 0 < expiry < 366*86400:
        raise UsageError('login_required', 'Claude 未返回有效的授权期限')
    scopes = data.get('scope')
    if isinstance(scopes, str) and 'user:profile' not in scopes.split():
        raise UsageError('login_required', '此授权缺少身份与用量读取权限，请重新授权')
    return {'access_token': data['access_token'], 'refresh_token': data.get('refresh_token') or '',
            'expires_at': time.time()+expiry, 'scope': scopes or SCOPES}


def exchange(code, verifier, state, proxy):
    return grant({'grant_type': 'authorization_code', 'code': code, 'redirect_uri': REDIRECT_URI,
                  'code_verifier': verifier, 'state': state}, proxy)


def renew(credentials, proxy):
    if not credentials.get('refresh_token'):
        raise UsageError('login_required', '后台查询授权已到期，请重新授权')
    value = grant({'grant_type': 'refresh_token', 'refresh_token': credentials['refresh_token']}, proxy)
    value['refresh_token'] = value['refresh_token'] or credentials['refresh_token']
    return {**credentials, **value}
