"""Read Claude OAuth endpoints over the account's explicitly bound proxy."""
import http.client
import json
import ssl
from email.utils import parsedate_to_datetime
import time
from agent_sessions.browser.proxy import connect_upstream
from .models import UsageError


def retry_after(value):
    try: return max(0, float(value))
    except (ValueError, TypeError):
        try: return max(0, parsedate_to_datetime(value).timestamp()-time.time())
        except (ValueError, TypeError, OverflowError): return 0


def checked(response):
    status, data = response.get('status', 0), response.get('data')
    error = data.get('error', {}) if isinstance(data, dict) else {}
    details = error.get('details', {}) if isinstance(error, dict) else {}
    code = details.get('error_code', '') if isinstance(details, dict) else ''
    code = code or (error.get('error_code') or error.get('type', '') if isinstance(error, dict) else '')
    if status in (400, 401, 403):
        if code == 'organization_disabled': raise UsageError('organization_disabled', 'Claude 返回：此组织已停用')
        if code in ('account_disabled', 'account_suspended', 'account_banned'):
            raise UsageError('account_disabled', 'Claude 返回：此账号已停用或封禁')
    if status == 429:
        raise UsageError('rate_limited', 'Claude 暂时限制了用量查询，稍后自动恢复', retry_after(response.get('retry_after')))
    if status == 401: raise UsageError('login_required', '登录已失效，请在此账号环境内重新登录')
    if status == 403:
        raise UsageError('blocked', 'Claude 拒绝了此次用量查询，请在账号环境内确认访问状态')
    if status != 200: raise UsageError('error', f'用量服务返回 HTTP {status}' if status else '用量服务连接未完成')
    if not isinstance(data, (dict, list)):
        raise UsageError('requires_browser', '请在账号浏览器中完成页面验证后，再刷新用量')
    return data


def proxy_response(host, path, proxy, body=None, token=''):
    if not proxy: raise UsageError('blocked', '请先为账号环境绑定专用代理，再查询用量')
    if host not in ('api.anthropic.com', 'platform.claude.com'): raise ValueError('授权服务地址无效')
    connection = http.client.HTTPSConnection(host, timeout=10)
    raw = None
    try:
        raw = connect_upstream(proxy, host, 443)
        raw.settimeout(10)
        connection.sock = ssl.create_default_context().wrap_socket(raw, server_hostname=host)
        headers = {'anthropic-beta': 'oauth-2025-04-20', 'User-Agent': 'Agent-Sessions/1.0', 'Accept': 'application/json'}
        if token: headers['Authorization'] = 'Bearer '+token
        if body is not None: headers['Content-Type'] = 'application/json'
        connection.request('POST' if body is not None else 'GET', path,
                           body=json.dumps(body).encode() if body is not None else None, headers=headers)
        response = connection.getresponse()
        body = response.read(524289)
        if len(body) > 524288: raise UsageError('error', '用量响应超过大小限制')
        try: data = json.loads(body)
        except ValueError: data = None
        return {'status': response.status, 'data': data, 'retry_after': response.getheader('Retry-After')}
    except (OSError, http.client.HTTPException):
        raise UsageError('error', '通过账号专用代理读取用量失败，请检查代理连接') from None
    finally:
        connection.close()
        if raw: raw.close()


def oauth_json(path, token, proxy):
    return checked(proxy_response('api.anthropic.com', path, proxy, token=token))
