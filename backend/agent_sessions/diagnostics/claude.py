"""Claude network diagnostics and a bounded local egress history."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import ipaddress
import json
from pathlib import Path
import threading
from .local import inspect_local, item
from .reputation import IpReputation
from .transport import fetch, ip_details, route_config, trace

TARGETS = {
    'claude-trace': ('Claude 域名出口', 'https://claude.ai/cdn-cgi/trace'),
    'cloudflare-trace': ('Cloudflare 域名出口', 'https://www.cloudflare.com/cdn-cgi/trace'),
    'claude-web': ('Claude 网页传输', 'https://claude.ai/'),
    'anthropic-api': ('Anthropic API 传输', 'https://api.anthropic.com/v1/models'),
    'ipv6': ('IPv6 出口', 'https://api6.ipify.org?format=json'),
}


def network_item(key, result):
    title, url = TARGETS[key]
    if not result.get('ok'):
        return item(key, title, 'unknown' if key == 'ipv6' else 'fail', result.get('error', '连接失败'), url, '后台检测链路')
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

    def run(self, value, claude_home):
        route, proxy = route_config(value)
        if not self.running.acquire(blocking=False): raise ValueError('已有检测正在运行，请稍后重试')
        try:
            with ThreadPoolExecutor(max_workers=6) as pool:
                tasks = {key: pool.submit(fetch, url, proxy, ipv6=key == 'ipv6',
                                          head=key == 'claude-web')
                         for key, (_, url) in TARGETS.items()}
                local = pool.submit(inspect_local, claude_home)
                results = {key: task.result() for key, task in tasks.items()}
                checks = [network_item(key, result) for key, result in results.items()]
                local_checks = local.result()
            exits = {name: trace(results[name+'-trace']) for name in ('claude', 'cloudflare')}
            ip = exits['claude'].get('ip', '')
            with ThreadPoolExecutor(max_workers=2) as pool:
                metadata = pool.submit(ip_details, ip, proxy) if ip else None
                reputation = self.reputation.lookup(ip, proxy)
                details = metadata.result() if metadata else {}
            checks.extend([
                item('dns-leak', 'DNS 公网出口', 'unknown', '尚未验证',
                     '本次没有通过权威 DNS 探针验证目标环境的解析出口；本机 DNS 配置见下方。', '目标环境'),
                item('desktop-transport', '官方 App 实际链路', 'unknown', '尚未验证',
                     '本页网络请求由 Agent Sessions 后台发出，不代表运行中的 Claude App、Code 或 Cowork 已使用同一路由。', 'Claude App'),
            ])
            old = self.history()
            previous = next((row for row in old if row.get('route') == route and row.get('claude_ip')), None)
            if ip and previous:
                changed = previous['claude_ip'] != ip
                checks.append(item('egress-change', '同链路出口变化', 'warn' if changed else 'pass',
                                   f"{previous['claude_ip']} → {ip}" if changed else '与上次一致',
                                   f"上次检测：{previous['checked_at']}", '本机检测历史'))
            report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'route': route,
                      'exits': exits, 'ip_details': details, 'ip_reputation': reputation,
                      'checks': checks, 'local_checks': local_checks}
            entry = {'checked_at': report['checked_at'], 'route': route, 'claude_ip': ip,
                     'cloudflare_ip': exits['cloudflare'].get('ip', ''),
                     'country': exits['claude'].get('country', ''), 'org': details.get('org', '')}
            self.save([entry, *old])
            return {**report, 'history': [entry, *old][:30]}
        finally:
            self.running.release()
