"""Net.Coffee website lookup for the measured Claude egress address."""
from datetime import datetime, timezone
import ipaddress
import json
import time
from .transport import fetch

FLAGS = {'proxy': 'is_proxy', 'vpn': 'is_vpn', 'tor': 'is_tor',
         'hosting': 'is_datacenter', 'scraper': 'is_crawler', 'abuse': 'is_abuser'}


class IpReputation:
    def __init__(self):
        self.cache = {}

    def lookup(self, ip, proxy):
        report = {'provider': 'Net.Coffee', 'ip': ip, 'state': 'unknown',
                  'queried_at': datetime.now(timezone.utc).isoformat(), 'cached': False}
        if not ip:
            return {**report, 'message': '未取得 Claude 域名出口 IP，暂时无法查询信誉。'}
        ip = str(ipaddress.ip_address(ip))
        report['source_url'] = f'https://ip.net.coffee/ip/{ip}'
        cached = self.cache.get(ip)
        if cached and time.monotonic() < cached[0]:
            return {**cached[1], 'cached': True}
        result = fetch(f'https://ip.net.coffee/api/ip/lookup/{ip}', proxy)
        if not result.get('ok'):
            return {**report, 'message': result.get('error', 'Net.Coffee 连接失败')}
        code = result.get('code')
        if code != 200:
            return {**report, 'message': 'Net.Coffee 查询频率已达上限，请稍后重试。' if code == 429
                    else f'Net.Coffee 返回 HTTP {code}。'}
        try:
            data = json.loads(result['body'])
            if not isinstance(data, dict) or str(ipaddress.ip_address(data.get('ip', ''))) != ip:
                raise ValueError()
            flags = {key: value if type(value := data.get(field)) is bool else None
                     for key, field in FLAGS.items()}
            score = data.get('trust_score')
            score = score if type(score) in (int, float) and 0 <= score <= 100 else None
            network = ('Residential' if data.get('isResidential') is True else
                       'Wireless' if data.get('is_mobile') is True else
                       'Hosting' if data.get('is_datacenter') is True else
                       'Business' if data.get('company_type') == 'business' else None)
            metadata = {key: data.get(field) if isinstance(data.get(field), str) else ''
                        for key, field in {'country': 'countryCode', 'region': 'region',
                                           'city': 'city', 'isp': 'isp'}.items()}
            asn = data.get('asn')
            if type(asn) is int and asn > 0 and isinstance(data.get('asOrganization'), str):
                metadata['org'] = f"AS{asn} {data['asOrganization']}"
            value = {**report, 'state': 'ok', 'network_type': network, 'trust_score': score,
                     'detections': flags, 'metadata': metadata}
        except (KeyError, TypeError, ValueError):
            return {**report, 'message': 'Net.Coffee 未返回与查询 IP 匹配的有效数据。'}
        if len(self.cache) >= 128: self.cache.pop(next(iter(self.cache)))
        self.cache[ip] = (time.monotonic() + 300, value)
        return value
