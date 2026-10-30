"""External Clash connectivity, stable account entrances and TUN supervision."""
import ipaddress
import json
from pathlib import Path
import subprocess
import sys
import threading
import time
from urllib.parse import quote
from uuid import uuid4
from agent_sessions.private_files import free_port, private_json
from .domains import direct_domains
from .client import Controller, source_config, verge_directory
from .rules import GROUP, install, rules


class NetworkManager:
    def __init__(self, directory, environments):
        self.directory, self.environments = Path(directory), environments
        self.path = self.directory/'clash-network.json'
        self.lock = threading.RLock()
        self.runtimes = []
        self.cached, self.cached_at = None, 0
        self.prepared = set()
        self.closed = threading.Event()

    def settings(self):
        saved = json.loads(self.path.read_text()) if self.path.exists() else {}
        defaults = {'endpoint': '', 'secret': '', 'group': GROUP, 'domains': [], 'dns': []}
        if not self.path.exists():
            try:
                policy = source_config().get('dns', {}).get('nameserver-policy', {})
                for domain, servers in policy.items():
                    if domain in ('+.sankuai.com', '+.sankuai.info'):
                        defaults['domains'].append(domain[2:])
                        defaults['dns'] += servers if isinstance(servers, list) else [servers]
                defaults['dns'] = list(dict.fromkeys(defaults['dns']))
            except (ValueError, OSError): pass
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
                     'domains': settings['domains'], 'dns': settings['dns']}
            try:
                client = Controller(settings)
                config = client.request('GET', '/configs')
                nodes = client.request('GET', '/proxies')['proxies']
                current_rules = client.request('GET', '/rules')['rules']
                source = source_config()
                inline = {row['name'] for row in source.get('proxies', [])}
                lines = [row for row in self.environments.read()['proxies'] if row.get('kind') == 'clash']
                expected = rules(settings)
                actual = [','.join((row['type'].lower().replace('-', ''), row['payload'], row['proxy'])) for row in current_rules]
                # Match the entire owned prefix, including company exceptions, in order.
                normalized = [','.join((row.split(',')[0].lower().replace('-', ''), row.split(',')[1], row.split(',')[2])) for row in expected]
                ready = bool(lines) and actual[:len(normalized)] == normalized and config.get('find-process-mode') != 'off'
                state.update(connected=True, controller=client.endpoint,
                             version=client.request('GET', '/version').get('version', ''),
                             tun=bool(config.get('tun', {}).get('enable')), mode=config.get('mode', ''),
                             current_node=nodes.get(GROUP, {}).get('now', '') if nodes.get(GROUP, {}).get('now') != 'REJECT' else '', routing_ready=ready,
                             nodes=[{'name': name, 'type': nodes[name]['type']} for name in sorted(inline) if name in nodes])
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
        nodes = client.request('GET', '/proxies')['proxies']
        for line in lines:
            if line['clash_node'] not in nodes: raise ValueError('绑定节点已不存在：'+line['clash_node'])
        install(client, {**settings, 'group': GROUP if lines else ''}, self.directory, lines)
        self.invalidate()

    def save_line(self, value):
        if any(not isinstance(item, str) or len(item) > 2048 for item in value.values()): raise ValueError('线路参数无效')
        if set(value)-{'id', 'name', 'node'} or not value.get('name', '').strip(): raise ValueError('请填写线路名称并选择节点')
        if any(c in value.get('node', '') for c in ',\r\n'): raise ValueError('节点名称不能包含英文逗号或换行')
        with self.lock:
            self.mutable()
            state = self.state(True)
            if value.get('node') not in {row['name'] for row in state['nodes']}: raise ValueError('绑定节点已不存在，请刷新后重新选择')
            current = self.environments.read()
            old = next((row for row in current['proxies'] if row['id'] == value.get('id')), None)
            if value.get('id') and not old: raise ValueError('原线路已不存在，请刷新后重试')
            key = old['id'] if old else str(uuid4())
            port = int(old['url'].rsplit(':', 1)[1]) if old and old.get('kind') == 'clash' else free_port()
            item = {'id': key, 'name': value['name'].strip(), 'kind': 'clash',
                    'url': f'http://127.0.0.1:{port}', 'clash_node': value['node']}
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

    def ensure(self, proxy, starting_profile=None):
        if not proxy or proxy.get('kind') != 'clash': raise ValueError('请先为环境选择 Clash 出口线路')
        self.activate(proxy, starting_profile)

    def activate(self, proxy, starting_profile=None):
        with self.lock:
            for profile in self.active(starting_profile) if starting_profile else []:
                other = next((row for row in self.environments.read()['proxies'] if row['id'] == profile['proxy_id']), {})
                if other.get('kind') == 'clash' and other['clash_node'] != proxy['clash_node']:
                    raise ValueError('另一个账号出口正在使用，请先停止该环境再切换线路')
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

    def close(self):
        self.closed.set()

    def open(self):
        if sys.platform == 'darwin': subprocess.Popen(['open', '-a', 'Clash Verge'])
        elif sys.platform == 'win32':
            import os
            paths = [Path(os.environ.get(key, ''))/'Clash Verge'/'Clash Verge.exe' for key in ('LOCALAPPDATA', 'PROGRAMFILES')]
            found = next((path for path in paths if path.is_file()), None)
            if not found: raise ValueError('未找到 Clash Verge，请先安装并打开')
            os.startfile(str(found))
        else: raise ValueError('请在系统中打开 Clash Verge')
