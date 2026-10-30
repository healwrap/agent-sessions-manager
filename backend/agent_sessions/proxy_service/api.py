"""Dedicated proxy API; reuse environment runtime mutation guards."""


def environment_state(server):
    return {**server.environments.read(), 'browser': server.browser_runtime.state(),
            'app_runtime': server.app_runtime.state(), 'proxy_runtime': server.proxy_manager.state(),
            'network': server.proxy_manager.network.state()}


def mutable(server, key):
    value = {'collection': 'proxies', 'action': 'delete', 'id': key}
    server.browser_runtime.ensure_mutable(value)
    server.app_runtime.ensure_mutable(value)


def can_update(server, key, ignored=None):
    settings = server.environments.read()
    for collection, runtime in (('profiles', server.browser_runtime), ('app_profiles', server.app_runtime)):
        with runtime.lock:
            for profile in settings[collection]:
                if profile['proxy_id'] != key: continue
                process = runtime.processes.get(profile['id'])
                if process and process.poll() is None: return False
                if profile['id'] != ignored and runtime.runs.get(profile['id'], {}).get('status') == 'checking': return False
    return True


def command(server, path, value):
    manager = server.proxy_manager
    action = path.rsplit('/', 1)[-1]
    if action == 'parse': return manager.imports.parse(value)
    if action == 'install':
        if value != {}: raise ValueError('代理安装参数无效')
        if any(row['alive'] for row in manager.state()['entries']): raise ValueError('请先停止专用代理，再安装或更新内核')
        manager.core.install()
    elif action == 'save':
        if isinstance(value, dict) and value.get('id'): mutable(server, value['id'])
        manager.save(value)
    elif action in ('start', 'stop', 'adopt', 'refresh'):
        if not isinstance(value, dict) or set(value) != {'id'}: raise ValueError('请选择代理')
        key = value['id']
        if action not in ('start', 'refresh'): mutable(server, key)
        if action == 'refresh': manager.updates.refresh(key)
        elif action == 'adopt':
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
        if old and old.get('kind') == 'clash' and value.get('action') == 'delete':
            server.proxy_manager.network.remove_line(key)
            return environment_state(server)
        if item.get('kind') == 'clash' or old and old.get('kind') == 'clash': raise ValueError('请在网络设置中选择 Clash 节点')
        if item.get('kind') == 'managed': raise ValueError('请通过创建专用代理导入节点')
    server.environments.change(value)
    return environment_state(server)
