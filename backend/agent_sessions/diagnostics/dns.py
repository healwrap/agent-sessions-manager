"""Observe recursive DNS servers using random names at authoritative probes."""
from concurrent.futures import ThreadPoolExecutor
import ipaddress
import json
import secrets
from .transport import fetch


def sample_dns(proxy=''):
    hosts = [secrets.token_hex(6)+f'.{family}.browserleaks.{domain}'
             for family in ('dns4', 'dns6') for domain in ('org', 'net')]
    servers, errors = {}, []
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = pool.map(lambda host: fetch('https://'+host, proxy), hosts)
        for result in results:
            if not result.get('ok') or result.get('code') != 200:
                errors.append(result.get('error') or f"HTTP {result.get('code', '未知')}")
                continue
            try:
                data = json.loads(result['body'])
                if not isinstance(data, dict): raise ValueError('探针响应格式无效')
                for address, info in data.items():
                    try: address = str(ipaddress.ip_address(address))
                    except ValueError: continue
                    if isinstance(info, list) and all(isinstance(value, str) for value in info):
                        servers[address] = {'ip': address, 'country': info[0] if info else '', 'info': info[1:]}
                if data.get('error'): errors.append(str(data['error']))
            except (ValueError, TypeError, KeyError): errors.append('探针响应格式无效')
    return {'state': 'observed' if servers else 'unknown', 'servers': list(servers.values()),
            'errors': list(dict.fromkeys(errors)) if not servers else []}
