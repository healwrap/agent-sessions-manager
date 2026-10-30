"""Network settings commands use the same lifecycle guards as account editing."""
import socket
from .client import Controller


def command(server, action, value):
    if not isinstance(value, dict): raise ValueError('网络参数格式无效')
    manager = server.proxy_manager.network
    if action == 'connect': return manager.connect(value)
    if action == 'apply': return manager.apply(value)
    if action == 'refresh':
        if value: raise ValueError('刷新参数无效')
        return manager.state(True)
    if action == 'open':
        if value: raise ValueError('打开参数无效')
        manager.open()
        return manager.state(True)
    if action == 'save-line':
        from agent_sessions.proxy_service.api import environment_state
        manager.save_line(value)
        return environment_state(server)
    if action == 'prepare':
        if set(value) != {'id'}: raise ValueError('请选择出口线路')
        proxy = next((row for row in server.environments.read()['proxies'] if row['id'] == value['id']), None)
        if not proxy or proxy.get('kind') != 'clash': raise ValueError('请选择 Clash 出口线路')
        manager.activate(proxy, '__inspection__')
        return manager.state(True)
    if action == 'intranet':
        if set(value) != {'host'}: raise ValueError('请填写内网域名')
        host = value['host'].strip().lower()
        domains = manager.settings()['domains']
        if not host or not any(host == d or host.endswith('.'+d) for d in domains):
            raise ValueError('请填写已配置的直连域名')
        from urllib.parse import quote
        result = Controller(manager.settings()).request('GET', '/dns/query?name='+quote(host)+'&type=A')
        addresses = [row['data'] for row in result.get('Answer', []) if row['type'] == 1]
        if not addresses: raise ValueError('DNS 未返回地址')
        with socket.create_connection((host, 443), timeout=3): pass
        return {'host': host, 'addresses': addresses, 'reachable': True}
    raise ValueError('网络操作无效')
