"""Third-party IP classification for the measured Claude egress address."""
from datetime import datetime, timezone
import ipaddress
import json
import time
from .transport import fetch

FLAGS = ('proxy', 'vpn', 'tor', 'hosting', 'compromised', 'scraper', 'anonymous')
NETWORK_TYPES = {'Residential', 'Business', 'Wireless', 'Hosting'}


def percentage(value):
    return value if type(value) is int and 0 <= value <= 100 else None


class IpReputation:
    def __init__(self):
        self.cache = {}

    def lookup(self, ip, proxy):
        report = {'provider': 'proxycheck.io', 'ip': ip, 'state': 'unknown',
                  'queried_at': datetime.now(timezone.utc).isoformat(), 'cached': False}
        if not ip:
            return {**report, 'message': '未取得 Claude 域名出口 IP，暂时无法查询信誉。'}
        ip = str(ipaddress.ip_address(ip))
        cached = self.cache.get(ip)
        if cached and time.monotonic() < cached[0]:
            return {**cached[1], 'cached': True}
        result = fetch(f'https://proxycheck.io/v3/{ip}?ver=24-June-2026', proxy)
        if not result.get('ok'):
            return {**report, 'message': result.get('error', 'IP 信誉服务连接失败')}
        code = result.get('code')
        if code not in (200, 206):
            messages = {403: '信誉服务拒绝查询，可能需要注册免费 API Key。',
                        429: '信誉服务查询额度或频率已达上限，请稍后重试。'}
            return {**report, 'message': messages.get(code, f'信誉服务返回 HTTP {code}。')}
        try:
            data = json.loads(result['body'])
            if not isinstance(data, dict) or data.get('status') not in ('ok', 'warning'):
                return {**report, 'message': '信誉服务未返回有效查询结果，可能已达到匿名查询额度。'}
            address = data.get(ip)
            if not isinstance(address, dict): raise ValueError()
            detections, network = address.get('detections'), address.get('network')
            if not isinstance(detections, dict) or not isinstance(network, dict): raise ValueError()
            flags = {key: value if type(value := detections.get(key)) is bool else None for key in FLAGS}
            value = {**report, 'state': 'ok',
                     'network_type': network.get('type') if network.get('type') in NETWORK_TYPES else None,
                     'risk': percentage(detections.get('risk')), 'detections': flags,
                     'confidence': percentage(detections.get('confidence')),
                     'last_seen': detections.get('last_seen'), 'updated_at': address.get('last_updated')}
        except (KeyError, TypeError, ValueError):
            return {**report, 'message': '信誉服务返回的数据格式不完整。'}
        # Short TTLs follow the provider guidance, particularly for residential proxies.
        ttl = 60 if flags.get('anonymous') or any(flags[key] for key in ('proxy', 'vpn', 'tor')) else 600
        if len(self.cache) >= 128: self.cache.pop(next(iter(self.cache)))
        self.cache[ip] = (time.monotonic() + ttl, value)
        return value
