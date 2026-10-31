"""Probe a specific saved entrance, without selecting it for a running account."""
from agent_sessions.browser.region import exit_ip, region_for
from agent_sessions.diagnostics.transport import fetch


def probe(line):
    exit = exit_ip(line['url'])
    api = fetch('https://api.anthropic.com/', line['url'], head=True)
    if not exit['ip']:
        return {'ok': False, 'transport_failed': not api.get('ok'),
                'error': '节点可连接，但出口探测暂不可用' if api.get('ok') else exit['error'] or '没有取得节点出口'}
    # Any valid HTTP response proves transport, including an unauthenticated 403/404.
    if not api.get('ok'): return {'ok': False, 'transport_failed': True, 'error': api.get('error') or 'Claude 服务连接失败'}
    region = region_for(line['url'], exit['ip'])
    if region.get('error'):
        return {'ok': False, 'transport_failed': False, 'error': '节点可连接，但出口地区尚未验证'}
    return {'ok': True, 'ip': exit['ip'], 'country': region['country'],
            'timezone': region['timezone'], 'locale': region['locale']}
