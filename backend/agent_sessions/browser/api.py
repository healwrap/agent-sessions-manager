"""Small browser runtime API dispatch."""
from .region import region_for


def command(server, path, value):
    if not isinstance(value, dict): raise ValueError('浏览器参数无效')
    if path.endswith('/check'):
        from .diagnostics import start
        return start(server.browser_runtime, value)
    if path.endswith('/install'):
        if set(value)-{'action'} or value.get('action', 'install') not in ('check', 'install'): raise ValueError('内核操作参数无效')
        check_only = value.get('action') == 'check'
        if not check_only and any(run['alive'] or run['status'] == 'checking' for run in server.browser_runtime.state()['runs']):
            raise ValueError('请先停止浏览器环境，再安装或更新内核')
        return server.browser_runtime.installer.start(check_only=check_only)
    if path.endswith('/open'): return server.browser_runtime.open(value)
    if path.endswith('/start'): return server.browser_runtime.launch(value)
    if path.endswith('/stop'):
        if set(value) != {'profile_id'}: raise ValueError('请选择要停止的环境')
        return server.browser_runtime.stop(value['profile_id'])
    if set(value) != {'proxy_id'}: raise ValueError('请选择出口代理')
    proxy = next((row for row in server.environments.read()['proxies'] if row['id'] == value['proxy_id']), None)
    if value['proxy_id'] and not proxy: raise ValueError('所选代理不存在')
    server.network.ensure(proxy)
    return region_for(proxy['url'] if proxy else '')
