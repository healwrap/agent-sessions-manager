"""Small browser runtime API dispatch."""
from .region import region_for


def command(server, path, value):
    if not isinstance(value, dict): raise ValueError('浏览器参数无效')
    if path.endswith('/check'):
        from .diagnostics import start
        return start(server.browser_runtime, value)
    if path.endswith('/install'):
        if value: raise ValueError('内核安装参数无效')
        return server.browser_runtime.installer.start()
    if path.endswith('/open'): return server.browser_runtime.open(value)
    if path.endswith('/start'): return server.browser_runtime.launch(value)
    if path.endswith('/stop'):
        if set(value) != {'profile_id'}: raise ValueError('请选择要停止的环境')
        return server.browser_runtime.stop(value['profile_id'])
    if set(value) != {'proxy_id'}: raise ValueError('请选择出口代理')
    proxy = next((row for row in server.environments.read()['proxies'] if row['id'] == value['proxy_id']), None)
    if value['proxy_id'] and not proxy: raise ValueError('所选代理不存在')
    return region_for(proxy['url'] if proxy else '')
