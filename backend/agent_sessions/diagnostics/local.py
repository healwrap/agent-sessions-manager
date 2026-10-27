"""Read local network configuration without modifying application state."""
import re
import subprocess
import sys
from pathlib import Path


def item(key, title, state, value, detail, scope='本机'):
    return {'id': key, 'title': title, 'state': state, 'value': value, 'detail': detail, 'scope': scope}


def command(*args):
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=3).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return ''


def inspect_network():
    rows = []
    if sys.platform != 'darwin':
        return [item('system-network', '系统代理与 DNS', 'unknown', '当前平台暂未读取',
                     '网络检测仍可使用系统路由或指定代理。')]
    proxy = command('/usr/sbin/scutil', '--proxy')
    enabled = [name for name in ('HTTP', 'HTTPS', 'SOCKS')
               if re.search(rf'\b{name}Enable\s*:\s*1\b', proxy)]
    pac = bool(re.search(r'ProxyAutoConfigEnable\s*:\s*1\b', proxy))
    rows.append(item('system-proxy', '系统代理', 'info',
                     '、'.join(enabled + (['PAC'] if pac else [])) or ('未开启' if proxy else '未取得配置'),
                     '“系统路由”检测不读取系统 HTTP / PAC 代理；仍遵循操作系统的 VPN / TUN 路由。'))
    dns = command('/usr/sbin/scutil', '--dns')
    servers = list(dict.fromkeys(re.findall(r'nameserver\[\d+\]\s*:\s*(\S+)', dns)))
    rows.append(item('dns-config', '本机 DNS 解析器', 'info' if servers else 'unknown',
                     '、'.join(servers) or '未取得解析器地址', '这是本机配置，不等同于 DNS 公网出口或泄漏检测。'))
    timezone = Path('/etc/localtime')
    try: zone = str(timezone.resolve()).split('zoneinfo/')[-1]
    except OSError: zone = ''
    rows.append(item('system-timezone', '电脑时区', 'info', zone or '未取得',
                     '仅展示电脑设置；目标 Claude / 浏览器的时区需要在对应环境验证。'))
    return rows
