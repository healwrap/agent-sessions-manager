"""Dedicated proxy API; reuse environment runtime mutation guards."""


def environment_state(server):
    return {**server.environments.read(), 'browser': server.browser_runtime.state(),
            'app_runtime': server.app_runtime.state(), 'proxy_runtime': server.proxy_manager.state()}


def mutable(server, key):
    value = {'collection': 'proxies', 'action': 'delete', 'id': key}
    server.browser_runtime.ensure_mutable(value)
    server.app_runtime.ensure_mutable(value)


def command(server, path, value):
    manager = server.proxy_manager
    action = path.rsplit('/', 1)[-1]
    if action == 'parse': return manager.imports.parse(value)
    if action == 'install':
        if value != {}: raise ValueError('代理安装参数无效')
        manager.core.install()
    elif action == 'save':
        if isinstance(value, dict) and value.get('id'): mutable(server, value['id'])
        manager.save(value)
    elif action in ('start', 'stop', 'adopt'):
        if not isinstance(value, dict) or set(value) != {'id'}: raise ValueError('请选择代理')
        key = value['id']
        if action != 'start': mutable(server, key)
        if action == 'adopt':
            from .legacy import adopt
            adopt(manager, key)
        else: getattr(manager, action)(key)
    else: raise ValueError('代理操作无效')
    return environment_state(server)


def change_environment(server, value):
    if value.get('collection') == 'proxies':
        item = value.get('item', {})
        key = value.get('id') or item.get('id')
        old = next((row for row in server.environments.read()['proxies'] if row['id'] == key), None)
        if old and old.get('kind') == 'managed':
            if value.get('action') != 'delete': raise ValueError('请在专用代理编辑器中修改此代理')
            server.proxy_manager.remove(key)
            return environment_state(server)
        if item.get('kind') == 'managed': raise ValueError('请通过创建专用代理导入节点')
    server.environments.change(value)
    return environment_state(server)
