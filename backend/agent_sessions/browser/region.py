"""Resolve the configured route's exit and region, without changing system settings."""
import ipaddress
import json
from pathlib import Path
import threading
import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from agent_sessions.diagnostics.transport import fetch, ip_details, trace

LOCALES = json.loads(Path(__file__).with_name('locales.json').read_text())
_cache, _lock = {}, threading.RLock()


def curl_proxy(value):
    return value.replace('socks5://', 'socks5h://', 1)


def exit_ip(proxy):
    endpoint = 'https://www.cloudflare.com/cdn-cgi/trace'
    result = fetch(endpoint, curl_proxy(proxy))
    data = trace(result)
    if data: return {'ip': data['ip'], 'source': endpoint, 'error': ''}
    result = fetch('https://api.ipify.org?format=json', curl_proxy(proxy))
    try:
        if not result.get('ok') or result.get('code') != 200: raise ValueError()
        return {'ip': str(ipaddress.ip_address(json.loads(result['body'])['ip'])),
                'source': 'https://api.ipify.org?format=json', 'error': ''}
    except (ValueError, KeyError, TypeError):
        return {'ip': '', 'source': endpoint, 'error': result.get('error', '未取得出口 IP')}


def region_for(proxy, ip=''):
    if not ip: ip = exit_ip(proxy)['ip']
    if not ip:
        return {'ip': '', 'country': '', 'timezone': '', 'locale': '', 'source': '', 'error': '未取得代理预检出口，无法定位'}
    ip = str(ipaddress.ip_address(ip))
    with _lock:
        cached = _cache.get(ip)
        if cached and time.monotonic() < cached[0]: return {**cached[1], 'cached': True}
    errors = []
    for provider in ('IPwho.is', 'IPinfo'):
        if provider == 'IPwho.is':
            result = fetch('https://ipwho.is/'+ip, curl_proxy(proxy))
            try:
                raw = json.loads(result['body']) if result.get('ok') and result.get('code') == 200 else {}
                valid = raw.get('success') is True and str(ipaddress.ip_address(raw.get('ip', ''))) == ip
                data = {'country': raw['country_code'], 'timezone': raw['timezone']['id']} if valid else {}
            except (ValueError, KeyError, TypeError, AttributeError): data = {}
            failure = result.get('error') or f"HTTP {result.get('code', '未取得响应')} 或返回资料不完整"
        else:
            data = ip_details(ip, curl_proxy(proxy))
            failure = '查询未完成或未返回完整地区资料'
        zone, country = data.get('timezone', ''), data.get('country', '')
        try: ZoneInfo(zone)
        except (ZoneInfoNotFoundError, ValueError, TypeError): zone = ''
        if zone and isinstance(country, str) and country in LOCALES:
            value = {'ip': ip, 'country': country, 'timezone': zone, 'locale': LOCALES[country],
                     'source': provider+' / CLDR 地区推荐', 'cached': False, 'error': ''}
            with _lock:
                if len(_cache) >= 128: _cache.pop(next(iter(_cache)))
                _cache[ip] = (time.monotonic()+300, value)
            return value
        errors.append(provider+'：'+failure)
    return {'ip': ip, 'country': '', 'timezone': '', 'locale': '', 'source': '', 'cached': False,
            'error': '出口定位未完成；'+'；'.join(errors)}
