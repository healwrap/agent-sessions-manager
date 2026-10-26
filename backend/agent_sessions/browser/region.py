"""Resolve the configured route's exit and region, without changing system settings."""
import ipaddress
import json
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from agent_sessions.diagnostics.transport import fetch, ip_details, trace

LOCALES = json.loads(Path(__file__).with_name('locales.json').read_text())


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
    if ip:
        data = ip_details(ip, curl_proxy(proxy))
    else:
        result = fetch('https://ipinfo.io/json', curl_proxy(proxy))
        try: data = json.loads(result['body']) if result.get('ok') else {}
        except (ValueError, KeyError): data = {}
    zone, country = data.get('timezone', ''), data.get('country', '')
    try: ZoneInfo(zone)
    except (ZoneInfoNotFoundError, ValueError): zone = ''
    return {'ip': ip or data.get('ip', ''), 'country': country, 'timezone': zone,
            'locale': LOCALES.get(country, ''), 'source': 'IPinfo / CLDR 地区推荐',
            'error': '' if zone and country in LOCALES else '出口定位未取得完整的时区与语言推荐'}
