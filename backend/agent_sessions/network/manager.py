"""External Clash connectivity, stable account entrances and TUN supervision."""
import ipaddress
import json
from pathlib import Path
import threading
import time
from urllib.parse import quote
from uuid import uuid4
from agent_sessions.private_files import free_port, private_json
from .domains import direct_domains
from .client import Controller, source_config
from .rules import GROUP, install, rules, restore, legacy_fragment
from .catalogue import profile_summary
from .nodes import parse as parse_node, import_existing
from . import system_proxy
from .verge import open_app


class NetworkManager:
    def __init__(self, directory, environments):
        self.directory, self.environments = Path(directory), environments
        self.path = self.directory/'clash-network.json'
        self.lock = threading.RLock()
        self.runtimes = []
        self.cached, self.cached_at = None, 0
        self.prepared = set()
        self.closed = threading.Event()
        self.applied = False
        self.restore_error = ''
        self.automatic_changes = {}
        self.suspended = False

    def settings(self):
        saved = json.loads(self.path.read_text()) if self.path.exists() else {}
        defaults = {'endpoint': '', 'secret': '', 'group': GROUP, 'domains': [], 'dns': [], 'auto_prepare': True}
        return {**defaults, **saved}

    def invalidate(self):
        self.cached_at = 0

    def state(self, refresh=False):
        with self.lock:
            if not refresh and self.cached is not None and time.monotonic()-self.cached_at < 1:
                return self.cached
            settings = self.settings()
            state = {'connected': False, 'version': '', 'tun': False, 'mode': '', 'error': '',
                     'endpoint': settings['endpoint'], 'secret_set': bool(settings['secret']),
                     'group': GROUP, 'current_node': '', 'nodes': [], 'routing_ready': False,
                     'domains': settings['domains'], 'dns': settings['dns'], 'auto_prepare': settings['auto_prepare'],
                     'routing_active': self.applied, 'restore_error': self.restore_error,
                     'system_proxy': system_proxy.read(), 'profile': {'name': '', 'type': '', 'dynamic_providers': 0}}
            try:
                client = Controller(settings)
                config = client.request('GET', '/configs')
                nodes = client.request('GET', '/proxies')['proxies']
                current_rules = client.request('GET', '/rules')['rules']
                source = source_config()
                lines = [row for row in self.environments.read()['proxies'] if row.get('kind') == 'clash']
                expected = rules(settings)
                actual = [','.join((row['type'].lower().replace('-', ''), row['payload'], row['proxy'])) for row in current_rules]
                # Match the entire owned prefix, including company exceptions, in order.
                normalized = [','.join((row.split(',')[0].lower().replace('-', ''), row.split(',')[1], row.split(',')[2])) for row in expected]
                ready = bool(lines) and actual[:len(normalized)] == normalized and config.get('find-process-mode') != 'off' and all(row['clash_node'] in nodes for row in lines)
                if ready: self.applied = True
                state['routing_active'] = self.applied
                state.update(connected=True, controller=client.endpoint,
                             version=client.request('GET', '/version').get('version', ''),
                             tun=bool(config.get('tun', {}).get('enable')), mode=config.get('mode', ''),
                             current_node=nodes.get(GROUP, {}).get('now', '') if nodes.get(GROUP, {}).get('now') != 'REJECT' else '', routing_ready=ready,
                             nodes=[{'name': row['clash_node'], 'type': row.get('node', {}).get('type', '')} for row in lines], profile=profile_summary(source),
                             secret_source='manual' if settings['secret'] else 'auto' if client.secret else 'none')
            except (ValueError, OSError, KeyError) as error: state['error'] = str(error)
            self.cached, self.cached_at = state, time.monotonic()
            return state

    def active(self, ignored=None):
        settings = self.environments.read()
        for collection, runtime in self.runtimes:
            for profile in settings[collection]:
                if profile['id'] == ignored: continue
                run = runtime.runs.get(profile['id'], {})
                process = runtime.processes.get(profile['id'])
                if run.get('status') == 'checking' or process and process.poll() is None:
                    yield profile

    def mutable(self):
        if next(self.active(), None): raise ValueError('请先停止运行中的账号环境，再修改网络配置')

    def connect(self, value):
        if set(value)-{'endpoint', 'secret'}: raise ValueError('连接参数无效')
        with self.lock:
            self.mutable()
            settings = self.settings()
            settings.update({key: value[key].strip() for key in value if value[key] or key == 'endpoint'})
            Controller(settings).request('GET', '/version')
            private_json(self.path, settings)
            self.invalidate()
            return self.state(True)

    def apply(self, value):
        if set(value) != {'domains', 'dns'}: raise ValueError('直连配置参数无效')
        domains = direct_domains(value['domains']) if value['domains'] else []
        try: dns = [str(ipaddress.ip_address(item)) for item in value['dns']]
        except ValueError: raise ValueError('DNS 服务器请填写 IP 地址') from None
        if len(dns) > 8: raise ValueError('DNS 服务器最多填写 8 个')
        with self.lock:
            self.mutable()
            settings = {**self.settings(), 'domains': domains, 'dns': dns}
            self._apply(settings)
            private_json(self.path, settings)
            return self.state(True)

    def _apply(self, settings, lines=None):
        lines = lines if lines is not None else [row for row in self.environments.read()['proxies'] if row.get('kind') == 'clash']
        client = Controller(settings)
        for line in lines:
            if not line.get('node'): raise ValueError('请先导入 Claude 专用节点：'+line['name'])
        install(client, {**settings, 'group': GROUP if lines else ''}, self.directory, lines)
        self.applied = True
        self.suspended = False
        self.restore_error = ''
        self.invalidate()

    def control(self, value):
        if set(value) != {'name', 'enabled'} or type(value['enabled']) is not bool:
            raise ValueError('开关参数无效')
        name, enabled = value['name'], value['enabled']
        if name not in ('tun', 'system_proxy', 'auto_prepare'): raise ValueError('网络开关无效')
        with self.lock:
            settings = self.settings()
            if name == 'auto_prepare':
                private_json(self.path, {**settings, 'auto_prepare': enabled})
            else:
                self.mutable()
                client = self._connected(settings)
                if name == 'tun':
                    client.request('PATCH', '/configs', {'tun': {'enable': enabled}})
                    actual = bool(client.request('GET', '/configs').get('tun', {}).get('enable'))
                    if actual != enabled: raise ValueError('TUN 未生效，请在 Clash Verge 完成服务安装或系统授权')
                    self.automatic_changes.pop('tun', None)
                else:
                    config = client.request('GET', '/configs')
                    port = config.get('mixed-port') or config.get('port')
                    if enabled and not port: raise ValueError('Clash 未开启 HTTP 或混合代理端口')
                    system_proxy.set_enabled(enabled, port or 0, self.directory)
            self.invalidate()
            return self.state(True)

    def _connected(self, settings, run=None):
        if self.closed.is_set() or run and run.get('cancelled'): raise ValueError('已取消网络准备')
        def connected():
            client = Controller(settings)
            client.request('GET', '/version')
            return client
        try: return connected()
        except (ValueError, OSError):
            if not settings['auto_prepare']: raise
        if run is not None: run['stage'] = '正在启动 Clash Verge'
        open_app()
        deadline = time.monotonic()+25
        error = 'Clash Verge 尚未就绪'
        while time.monotonic() < deadline:
            if self.closed.is_set() or run and run.get('cancelled'): raise ValueError('已取消网络准备')
            try: return connected()
            except (ValueError, OSError) as reason: error = str(reason)
            self.closed.wait(.25)
        raise ValueError('Clash Verge 启动未完成：'+error)

    def _prepare(self, settings, proxy, run):
        client = self._connected(settings, run)
        state = self.state(True)
        if not settings['auto_prepare']: return
        if not proxy.get('node'): raise ValueError('请先为此线路配置 Claude 专用节点')
        if run is not None: run['stage'] = '正在准备 TUN 和账号分流'
        config = client.request('GET', '/configs')
        # Install a rejecting Claude group before TUN starts capturing traffic.
        if not state['routing_ready']: self._apply(settings)
        patch = {}
        if state['mode'] != 'rule':
            self.automatic_changes.setdefault('mode', config.get('mode', 'rule'))
            patch['mode'] = 'rule'
        if not state['tun']:
            self.automatic_changes.setdefault('tun', False)
            patch['tun'] = {'enable': True}
        if patch:
            client.request('PATCH', '/configs', patch)
            self.invalidate()
            state = self.state(True)
        if run is not None: run['stage'] = '正在检查账号出口'

    def save_line(self, value):
        if set(value)-{'id', 'name', 'address', 'node_yaml', 'node'}: raise ValueError('线路参数无效')
        if not isinstance(value.get('name'), str) or not value['name'].strip() or len(value['name']) > 2048:
            raise ValueError('请填写线路名称')
        with self.lock:
            self.mutable()
            current = self.environments.read()
            old = next((row for row in current['proxies'] if row['id'] == value.get('id')), None)
            if value.get('id') and not old: raise ValueError('原线路已不存在，请刷新后重试')
            key = old['id'] if old else str(uuid4())
            node = parse_node(value, key)
            port = int(old['url'].rsplit(':', 1)[1]) if old and old.get('kind') == 'clash' else free_port()
            item = {'id': key, 'name': value['name'].strip(), 'kind': 'clash',
                    'url': f'http://127.0.0.1:{port}', 'clash_node': node['name'], 'node': node}
            self.environments.validate('proxies', item, current)
            lines = [row for row in current['proxies'] if row.get('kind') == 'clash' and row['id'] != key]+[item]
            self._apply(self.settings(), lines)
            self.environments.change({'collection': 'proxies', 'action': 'save', 'item': item})
            self.invalidate()
            return item

    def remove_line(self, key):
        with self.lock:
            self.mutable()
            current = self.environments.read()
            if any(row['proxy_id'] == key for row in current['profiles']+current['app_profiles']):
                raise ValueError('此线路已被环境引用，请先调整对应环境')
            lines = [row for row in current['proxies'] if row.get('kind') == 'clash' and row['id'] != key]
            self._apply(self.settings(), lines)
            self.environments.change({'collection': 'proxies', 'action': 'delete', 'id': key})
            self.invalidate()

    def ensure(self, proxy, starting_profile=None, run=None):
        if not proxy or proxy.get('kind') != 'clash': raise ValueError('请先为环境选择 Clash 出口线路')
        self.activate(proxy, starting_profile, run)

    def activate(self, proxy, starting_profile=None, run=None):
        with self.lock:
            if self.suspended and not starting_profile: raise ValueError('账号分流已停用，请先启动账号或应用分流')
            if starting_profile: self.suspended = False
            for profile in self.active(starting_profile) if starting_profile else []:
                other = next((row for row in self.environments.read()['proxies'] if row['id'] == profile['proxy_id']), {})
                if other.get('kind') == 'clash' and other['clash_node'] != proxy['clash_node']:
                    raise ValueError('另一个账号出口正在使用，请先停止该环境再切换线路')
            self._prepare(self.settings(), proxy, run)
            state = self.state(True)
            self._ready(state, proxy)
            client = Controller(self.settings())
            if starting_profile and state['current_node'] != proxy['clash_node']:
                client.request('PUT', '/proxies/'+quote(GROUP, safe=''), {'name': proxy['clash_node']})
                self.invalidate()
                state = self.state(True)
            if starting_profile and state['current_node'] != proxy['clash_node']: raise ValueError('Clash 未应用所选出口，请重新选择线路')
            # A per-line listener keeps background usage requests on their own node.
            import socket
            from urllib.parse import urlparse
            with socket.create_connection(('127.0.0.1', urlparse(proxy['url']).port), timeout=1): pass
            if starting_profile: self.prepared.add(starting_profile)

    @staticmethod
    def _ready(state, proxy):
        if not state['connected']: raise ValueError(state['error'] or 'Clash Verge 未连接')
        if not state['tun']: raise ValueError('请在 Clash Verge 开启 TUN 后再启动账号环境')
        if state['mode'] != 'rule': raise ValueError('请将 Clash Verge 切换到规则模式')
        if proxy['clash_node'] not in {row['name'] for row in state['nodes']}: raise ValueError('绑定节点已不存在，请重新选择出口线路')
        if not state['routing_ready']: raise ValueError('账号分流规则未生效，请到网络设置应用分流配置')

    def check(self, proxy):
        state = self.state()
        self._ready(state, proxy)
        if state['current_node'] != proxy['clash_node']: raise ValueError('Clash 当前出口已变化，已停止此账号环境')

    def start(self):
        # Migrate the old global patch once, before any account is allowed to start.
        try:
            proxies = self.environments.read()['proxies']
            # A new/isolated state does not own another instance's global script.
            if proxies or (self.directory/'network-baseline.json').is_file():
                source = source_config()
                pending = any(proxy.get('kind') == 'clash' and not proxy.get('node') for proxy in proxies)
                if pending and hasattr(self.environments, 'path'):
                    backup = self.directory/'network-node-migration-backup.json'
                    if not backup.exists(): private_json(backup, json.loads(self.environments.path.read_text(encoding='utf-8')))
                for proxy in proxies:
                    if proxy.get('kind') == 'clash' and not proxy.get('node'):
                        self.environments.change({'collection': 'proxies', 'action': 'save', 'item': import_existing(proxy, source)})
                if legacy_fragment()[2]: restore(Controller(self.settings()), self.directory)
                if self.environments.read()['proxies']:
                    self._apply(self.settings())
        except (ValueError, OSError) as error: self.restore_error = str(error)
        threading.Thread(target=self._watch, daemon=True).start()

    def _watch(self):
        while not self.closed.wait(.5):
            for collection, runtime in self.runtimes:
                settings = self.environments.read()
                for profile in settings[collection]:
                    key = profile['id']
                    run = runtime.runs.get(key, {})
                    if key not in self.prepared or run.get('status') not in ('running', 'checking'): continue
                    proxy = next((row for row in settings['proxies'] if row['id'] == profile['proxy_id']), {})
                    if proxy.get('kind') != 'clash': continue
                    try: self.check(proxy)
                    except (ValueError, OSError) as error:
                        try: runtime.stop(key)
                        except (ValueError, OSError) as stop_error:
                            with runtime.lock: run.update(error=str(error)+'；停止失败：'+str(stop_error))
                            continue
                        with runtime.lock:
                            run.update(status='blocked', stage='网络状态变化，已停止环境', error=str(error))
                        self.prepared.discard(key)

    def _restore(self):
        client = Controller(self.settings())
        restore(client, self.directory)
        config = client.request('GET', '/configs')
        patch = {}
        if 'mode' in self.automatic_changes and config.get('mode') == 'rule':
            patch['mode'] = self.automatic_changes['mode']
        if 'tun' in self.automatic_changes and config.get('tun', {}).get('enable'):
            patch['tun'] = {'enable': self.automatic_changes['tun']}
        if patch: client.request('PATCH', '/configs', patch)
        self.applied, self.restore_error = False, ''
        self.automatic_changes.clear()
        self.invalidate()

    def close(self):
        self.closed.set()
        with self.lock:
            if not self.applied and not self.automatic_changes: return
            try: self._restore()
            except (ValueError, OSError) as error:
                self.restore_error = '退出时恢复 Clash 配置失败：'+str(error)
                import warnings
                warnings.warn(self.restore_error)

    def reset(self):
        with self.lock:
            self.mutable()
            self._restore()
            self.suspended = True
            return self.state(True)

    def open(self):
        open_app()
