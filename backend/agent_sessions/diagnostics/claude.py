"""Claude network diagnostics and a bounded local egress history."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import ipaddress
import json
import re
import socket
from pathlib import Path
import threading
from .local import inspect_network, item
from .reputation import IpReputation
from .transport import fetch, ip_details, route_config, trace

TARGETS = {
    'claude-trace': ('Claude 域名出口', 'https://claude.ai/cdn-cgi/trace'),
    'cloudflare-trace': ('Cloudflare 域名出口', 'https://www.cloudflare.com/cdn-cgi/trace'),
    'claude-web': ('Claude 网页传输', 'https://claude.ai/'),
    'anthropic-api': ('Anthropic API 传输', 'https://api.anthropic.com/v1/models'),
    'ipv6': ('IPv6 出口', 'https://api64.ipify.org?format=json'),
}


def ipv6_probe(proxy):
    if proxy:
        return {'ok': False, 'error': '代理端 IPv6 尚未验证',
                'detail': 'HTTP / SOCKS 代理的目标连接由代理端建立，当前探针不能强制其使用 IPv6。'}
    try:
        with socket.socket(socket.AF_INET6, socket.SOCK_DGRAM) as probe:
            # UDP connect selects a local route without sending any packet.
            probe.connect(('2606:4700:4700::1111', 443))
    except OSError:
        return {'ok': False, 'error': '本机无可用 IPv6 路由',
                'detail': '本机没有可用的 IPv6 默认出口，已跳过公网 IPv6 请求。'}
    return fetch(TARGETS['ipv6'][1], ipv6=True)


def network_item(key, result):
    title, url = TARGETS[key]
    if not result.get('ok'):
        detail = result.get('detail', url)
        if result.get('attempts', 1) > 1: detail += '；已通过相同链路重试一次。'
        return item(key, title, 'unknown' if key == 'ipv6' else 'fail', result.get('error', '连接失败'), detail, '后台检测链路')
    code, ms = result['code'], result['ms']
    if key.endswith('-trace'):
        data = trace(result)
        if data:
            return item(key, title, 'pass', data['ip'], f"{data['country']} · {data['colo']} · {ms} ms", '后台检测链路')
    elif key == 'ipv6':
        try:
            ip = str(ipaddress.IPv6Address(json.loads(result['body'])['ip']))
            return item(key, title, 'info', ip, '取得 IPv6 出口；这个结果本身不代表发生泄漏。', '后台检测链路')
        except (ValueError, TypeError, KeyError): pass
    elif 200 <= code < 400:
        return item(key, title, 'pass', f'HTTP {code} · {ms} ms', '已取得 TLS / HTTP 响应。', '后台检测链路')
    if key == 'anthropic-api' and code == 401:
        return item(key, title, 'pass', f'HTTP 401 · {ms} ms', 'API 已到达；本次未发送认证信息，未验证账号或模型可用性。', '后台检测链路')
    if key == 'claude-web' and code == 403 and re.search(r'^cf-mitigated:\s*challenge', result.get('body', ''), re.I | re.M):
        return {**item(key, title, 'info', f'HTTP 403 · {ms} ms',
                       '已到达 Cloudflare；响应要求浏览器验证，请在 Claude 网页完成。', '后台检测链路'),
                'label': '需浏览器验证'}
    detail = '服务器拒绝访问，可能需要浏览器验证；不能据此判断账号状态。' if code == 403 else '取得服务器响应，未取得完整检测数据。'
    return item(key, title, 'warn', f'HTTP {code} · {ms} ms', detail, '后台检测链路')


class ClaudeDiagnostics:
    def __init__(self, directory):
        self.path = Path(directory)/'diagnostics/claude-history.json'
        self.lock = threading.RLock()
        self.running = threading.BoundedSemaphore(1)
        self.reputation = IpReputation()

    def history(self):
        with self.lock:
            if not self.path.exists(): return []
            data = json.loads(self.path.read_text(encoding='utf-8'))
            return data if isinstance(data, list) else []

    def save(self, rows):
        with self.lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix('.tmp')
            temporary.write_text(json.dumps(rows[:30], ensure_ascii=False, indent=2), encoding='utf-8')
            temporary.chmod(0o600)
            temporary.replace(self.path)

    def clear(self):
        self.save([])
        return {'history': []}

    def run(self, value):
        if not isinstance(value, dict): raise ValueError('检测参数格式无效')
        network_value = {key: val for key, val in value.items() if key != 'lookup_proxy'}
        route, proxy = route_config(network_value)
        lookup_route, lookup_proxy = (route_config({'mode': 'proxy', 'proxy': value['lookup_proxy']})
                                     if 'lookup_proxy' in value else (route, proxy))
        if not self.running.acquire(blocking=False): raise ValueError('已有检测正在运行，请稍后重试')
        try:
            with ThreadPoolExecutor(max_workers=6) as pool:
                tasks = {key: (pool.submit(ipv6_probe, proxy) if key == 'ipv6' else
                               pool.submit(fetch, url, proxy, head=key == 'claude-web'))
                         for key, (_, url) in TARGETS.items()}
                local = pool.submit(inspect_network)
                results = {key: task.result() for key, task in tasks.items()}
                checks = [network_item(key, result) for key, result in results.items()]
                local_checks = local.result()
            exits = {name: trace(results[name+'-trace']) for name in ('claude', 'cloudflare')}
            for name, exit in exits.items():
                if not exit.get('ip'):
                    result = results[name+'-trace']
                    exit.update(error=result.get('error', f"HTTP {result.get('code', '未知')}，未取得出口"),
                                ms=result.get('ms'), attempts=result.get('attempts', 1))
            ip = exits['claude'].get('ip', '')
            with ThreadPoolExecutor(max_workers=2) as pool:
                metadata = pool.submit(ip_details, ip, lookup_proxy) if ip else None
                reputation = self.reputation.lookup(ip, lookup_proxy)
                details = metadata.result() if metadata else {}
            checks.extend([
                item('dns-leak', 'DNS 公网出口', 'unknown', '尚未验证',
                     '本次没有通过权威 DNS 探针验证目标环境的解析出口；本机 DNS 配置见下方。', '目标环境'),
            ])
            old = self.history()
            previous = next((row for row in old if row.get('route') == route and row.get('claude_ip')), None)
            if ip and previous:
                changed = previous['claude_ip'] != ip
                checks.append(item('egress-change', '同链路出口变化', 'warn' if changed else 'pass',
                                   f"{previous['claude_ip']} → {ip}" if changed else '与上次一致',
                                   f"上次检测：{previous['checked_at']}", '本机检测历史'))
            report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'route': route,
                      'lookup_route': lookup_route, 'exits': exits, 'ip_details': details, 'ip_reputation': reputation,
                      'checks': checks, 'local_checks': local_checks}
            entry = {'checked_at': report['checked_at'], 'route': route, 'claude_ip': ip,
                     'cloudflare_ip': exits['cloudflare'].get('ip', ''),
                     'country': exits['claude'].get('country', ''), 'org': details.get('org', '')}
            self.save([entry, *old])
            return {**report, 'history': [entry, *old][:30]}
        finally:
            self.running.release()
