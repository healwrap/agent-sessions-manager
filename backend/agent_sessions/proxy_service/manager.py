"""Application-owned dedicated proxy definitions and process lifecycle."""
import json
from pathlib import Path
import subprocess
import shutil
import threading
from uuid import UUID, uuid4
from .config import configuration, direct_domains, node_config, DEFAULT_DIRECT
from .core import ProxyCore
from .imports import NodeImports
from .process import ProxyProcess, private_json, free_port


class ProxyManager:
    def __init__(self, directory, environments):
        self.directory = Path(directory)/'proxy-services'
        self.environments = environments
        self.core = ProxyCore(self.directory/'core')
        self.imports = NodeImports()
        self.lock = threading.RLock()
        self.processes, self.errors = {}, {}

    def entry_directory(self, key):
        try: UUID(key)
        except (ValueError, TypeError, AttributeError): raise ValueError('代理标识无效') from None
        return self.directory/'entries'/key

    def definition(self, key):
        try: return json.loads((self.entry_directory(key)/'definition.json').read_text())
        except FileNotFoundError: raise ValueError('专用代理配置不存在，请重新导入') from None

    def process(self, key):
        if key in self.processes: return self.processes[key]
        found = self.core.discover()
        if not found['available']: raise ValueError('请先安装代理内核')
        if key not in self.processes:
            self.processes[key] = ProxyProcess(self.entry_directory(key), found['path'])
        return self.processes[key]

    def validate(self, key, entry):
        found = self.core.discover()
        if not found['available']: raise ValueError('请先安装代理内核')
        directory = self.entry_directory(key)
        candidate = directory/'candidate.json'
        private_json(candidate, configuration(entry))
        try:
            result = subprocess.run([found['path'], '-t', '-d', str(directory), '-f', str(candidate)],
                                    capture_output=True, text=True, timeout=20)
            if result.returncode: raise ValueError('节点配置未通过 Mihomo 检查：'+(result.stdout+result.stderr)[-1500:])
        finally: candidate.unlink(missing_ok=True)

    def save(self, value):
        if not isinstance(value, dict) or set(value)-{'id', 'name', 'token', 'index', 'direct_domains'}:
            raise ValueError('专用代理配置字段无效')
        key = value.get('id') or str(uuid4())
        with self.lock:
            existing = next((row for row in self.environments.read()['proxies'] if row['id'] == key), None)
            if existing and existing.get('kind') != 'managed': raise ValueError('已有代理地址不能直接改成专用代理，请使用接管或新建')
            previous = self.definition(key) if existing else None
            node = self.imports.select(value['token'], value.get('index')) if value.get('token') else previous['node'] if previous else None
            if node is None: raise ValueError('请先导入配置并选择节点')
            node_config(node)
            entry = {'node': node, 'port': previous['port'] if previous else free_port(),
                     'direct_domains': direct_domains(value.get('direct_domains', DEFAULT_DIRECT)), 'auto_start': True}
            item = {'id': key, 'name': value.get('name', ''), 'url': f"http://127.0.0.1:{entry['port']}", 'kind': 'managed'}
            self.environments.validate('proxies', item, self.environments.read())
            self.validate(key, entry)
            process = self.process(key)
            was_running = process.alive()
            process.stop()
            private_json(self.entry_directory(key)/'definition.json', entry)
            private_json(self.entry_directory(key)/'config.json', configuration(entry))
            try: self.environments.change({'collection': 'proxies', 'action': 'save', 'item': item})
            except Exception:
                if previous:
                    private_json(self.entry_directory(key)/'definition.json', previous)
                    private_json(self.entry_directory(key)/'config.json', configuration(previous))
                    if was_running: process.start(previous['port'])
                raise
            self.start(key)
            return item

    def ensure(self, proxy):
        if proxy and proxy.get('kind') == 'managed':
            self.start(proxy['id'])
            if self.errors.get(proxy['id']): raise ValueError(self.errors[proxy['id']])

    def start(self, key):
        with self.lock:
            entry = self.definition(key)
            try:
                self.process(key).start(entry['port'])
                self.errors.pop(key, None)
                entry['auto_start'] = True
                private_json(self.entry_directory(key)/'definition.json', entry)
            except (ValueError, OSError) as error:
                self.errors[key] = str(error)
            return self.state()

    def stop(self, key):
        with self.lock:
            entry = self.definition(key)
            self.process(key).stop()
            self.errors.pop(key, None)
            entry['auto_start'] = False
            private_json(self.entry_directory(key)/'definition.json', entry)
            return self.state()

    def remove(self, key):
        with self.lock:
            # EnvironmentSettings rejects deletion while any environment still references it.
            self.environments.change({'collection': 'proxies', 'action': 'delete', 'id': key})
            if self.core.discover()['available']: self.process(key).stop()
            self.processes.pop(key, None)
            shutil.rmtree(self.entry_directory(key))

    def restore(self):
        for item in self.environments.read()['proxies']:
            if item.get('kind') != 'managed': continue
            try:
                if self.definition(item['id']).get('auto_start'): self.start(item['id'])
                elif self.core.discover()['available']: self.process(item['id']).stop()
            except (OSError, ValueError) as error: self.errors[item['id']] = str(error)

    def state(self):
        with self.lock:
            entries = []
            for item in self.environments.read()['proxies']:
                if item.get('kind') != 'managed': continue
                key = item['id']
                try:
                    entry = self.definition(key)
                    process = self.process(key) if self.core.discover()['available'] else None
                    alive = bool(process and process.alive())
                    entries.append({'id': key, 'alive': alive, 'pid': process.pid if alive else None,
                                    'status': 'running' if alive else 'failed' if key in self.errors or entry.get('auto_start') else 'stopped',
                                    'error': self.errors.get(key, '') or ('代理进程已退出' if not alive and entry.get('auto_start') else ''),
                                    'node': {'name': entry['node']['name'], 'type': entry['node']['type']},
                                    'direct_domains': entry['direct_domains']})
                except (OSError, ValueError, KeyError) as error:
                    entries.append({'id': key, 'alive': False, 'status': 'failed', 'error': str(error), 'direct_domains': []})
            from .legacy import available
            return {'core': self.core.state(), 'entries': entries, 'adoptable': available(self.directory, self.environments)}

    def close(self):
        with self.lock:
            for process in self.processes.values(): process.stop()
