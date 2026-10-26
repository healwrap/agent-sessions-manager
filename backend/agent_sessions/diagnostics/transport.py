"""Bounded, unauthenticated HTTPS probes through an explicitly selected route."""
import ipaddress
import json
import os
import shutil
import subprocess
from urllib.parse import urlsplit

MARKER = '\nAGENT_SESSIONS_METRICS\t'


def route_config(value):
    if not isinstance(value, dict) or set(value) - {'mode', 'proxy'}:
        raise ValueError('检测参数格式无效')
    mode = value.get('mode', 'direct')
    if mode == 'direct':
        return {'mode': mode, 'label': '系统路由', 'endpoint': ''}, ''
    if mode != 'proxy': raise ValueError('请选择系统路由或指定代理')
    proxy = value.get('proxy', '')
    if not isinstance(proxy, str) or len(proxy) > 2048 or not proxy:
        raise ValueError('请填写代理地址')
    if any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in proxy):
        raise ValueError('代理地址不能包含空格或控制字符')
    try:
        parsed = urlsplit(proxy)
        if (parsed.scheme not in {'http', 'https', 'socks5h'} or not parsed.hostname
                or not parsed.port or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
            raise ValueError()
    except ValueError:
        raise ValueError('代理地址应为 http://主机:端口、https://主机:端口或 socks5h://主机:端口') from None
    host = f'[{parsed.hostname}]' if ':' in parsed.hostname else parsed.hostname
    endpoint = f'{parsed.scheme}://{host}:{parsed.port}'
    return {'mode': mode, 'label': '指定代理', 'endpoint': endpoint}, proxy


def fetch(url, proxy='', *, ipv6=False, head=False):
    curl = shutil.which('curl')
    if not curl: return {'ok': False, 'error': '没有找到 curl，无法运行网络检测'}
    # Proxy credentials are supplied to curl over stdin, never process arguments.
    quoted = proxy.replace('\\', '\\\\').replace('"', '\\"')
    config = f'proxy = "{quoted}"\n' if proxy else ''
    args = [curl, '-q', '--config', '-', '--silent', '--show-error', '--location',
            '--max-redirs', '2', '--proto', '=https', '--proto-redir', '=https',
            '--connect-timeout', '4', '--max-time', '8', '--max-filesize', '131072',
            '--noproxy', '' if proxy else '*', '--user-agent', 'Agent-Sessions-Diagnostics/1.0',
            '--write-out', MARKER+'%{http_code}\t%{time_total}\t%{remote_ip}\t%{ssl_verify_result}']
    if ipv6 and not proxy: args.append('--ipv6')
    if head: args.append('--head')
    args.append(url)
    keep = {'PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR',
            'SSL_CERT_FILE', 'SSL_CERT_DIR', 'CURL_CA_BUNDLE'}
    env = {k: v for k, v in os.environ.items() if k in keep}
    try:
        run = subprocess.run(args, input=config, text=True, capture_output=True, env=env, timeout=10)
        body, _, metrics = run.stdout.rpartition(MARKER)
        code, elapsed, peer, verify = metrics.strip().split('\t')
        code, elapsed, verify = int(code), float(elapsed), int(verify)
        if run.returncode:
            errors = {5: '代理主机解析失败', 6: '目标域名解析失败', 7: '无法建立连接',
                      28: '连接超时', 35: 'TLS 握手失败', 60: 'TLS 证书校验失败',
                      63: '响应超过检测大小限制', 97: '代理握手失败'}
            return {'ok': False, 'code': code, 'error': errors.get(run.returncode, f'连接失败（curl {run.returncode}）')}
        if verify or not 100 <= code <= 599:
            return {'ok': False, 'error': '未取得有效的 TLS / HTTP 响应'}
        return {'ok': True, 'code': code, 'ms': round(elapsed * 1000), 'peer': peer,
                'body': body[:131072]}
    except subprocess.TimeoutExpired:
        return {'ok': False, 'error': '检测超时'}
    except (OSError, ValueError):
        return {'ok': False, 'error': '未取得有效检测响应'}


def trace(result):
    if not result.get('ok') or result.get('code') != 200: return {}
    data = dict(line.split('=', 1) for line in result.get('body', '').splitlines() if '=' in line)
    try: ip = str(ipaddress.ip_address(data.get('ip', '')))
    except ValueError: return {}
    return {'ip': ip, 'country': data.get('loc', ''), 'colo': data.get('colo', ''),
            'http': data.get('http', ''), 'ms': result.get('ms')}


def ip_details(ip, proxy):
    result = fetch(f'https://ipinfo.io/{ip}/json', proxy)
    if not result.get('ok') or result.get('code') != 200: return {}
    try:
        data = json.loads(result['body'])
        if str(ipaddress.ip_address(data.get('ip', ''))) != ip: return {}
        # Keep only the fields used by the result panel; no account data is sent.
        return {k: data.get(k, '') for k in ('country', 'region', 'city', 'org', 'timezone')}
    except (ValueError, TypeError, AttributeError):
        return {}
