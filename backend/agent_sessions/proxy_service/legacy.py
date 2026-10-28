"""Adopt the one application-owned service created before lifecycle UI existed."""
import os
import plistlib
import subprocess
import time
from urllib.parse import urlsplit
import yaml
from .config import DEFAULT_DIRECT, configuration, node_config
from .process import private_json, listening

LABEL = 'local.agent-sessions.proxy.us-grande'


def legacy(directory):
    config = directory/'us-grande-661679194'/'config.yaml'
    plist = directory.parents[2]/'LaunchAgents'/(LABEL+'.plist')
    if not config.is_file() or not plist.is_file(): return None
    service = plistlib.loads(plist.read_bytes())
    args = service.get('ProgramArguments', [])
    if service.get('Label') != LABEL or '-f' not in args or args[args.index('-f')+1] != str(config): return None
    value = yaml.safe_load(config.read_text())
    listener = next((row for row in value.get('listeners', []) if row.get('port') == 53169 and row.get('listen') == '127.0.0.1'), None)
    node = next((row for row in value.get('proxies', []) if listener and row['name'] == listener.get('proxy')), None)
    if not node: return None
    node_config(node)
    return plist, node


def available(directory, environments):
    try:
        if not legacy(directory): return []
        return [row['id'] for row in environments.read()['proxies'] if row.get('kind') != 'managed'
                and row['url'] == 'http://127.0.0.1:53169']
    except (OSError, ValueError, KeyError, IndexError, yaml.YAMLError): return []


def adopt(manager, key):
    with manager.lock:
        if key not in available(manager.directory, manager.environments): raise ValueError('没有可接管的旧专用代理')
        item = next(row for row in manager.environments.read()['proxies'] if row['id'] == key)
        plist, node = legacy(manager.directory)
        entry = {'node': node, 'port': urlsplit(item['url']).port, 'direct_domains': DEFAULT_DIRECT, 'auto_start': True}
        manager.validate(key, entry)
        backup = manager.directory/'legacy-backup'/plist.name
        backup.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if backup.exists(): raise ValueError('旧服务备份已存在，请先检查代理迁移状态')
        result = subprocess.run(['launchctl', 'bootout', f'gui/{os.getuid()}/'+LABEL], capture_output=True, text=True)
        if result.returncode and listening(entry['port']): raise ValueError('旧服务仍在运行，无法接管')
        for _ in range(30):
            if not listening(entry['port']): break
            time.sleep(.1)
        plist.replace(backup)
        try:
            private_json(manager.entry_directory(key)/'definition.json', entry)
            private_json(manager.entry_directory(key)/'config.json', configuration(entry))
            manager.process(key).start(entry['port'])
            manager.environments.change({'collection': 'proxies', 'action': 'save', 'item': {**item, 'kind': 'managed'}})
        except Exception:
            manager.process(key).stop()
            (manager.entry_directory(key)/'definition.json').unlink(missing_ok=True)
            backup.replace(plist)
            subprocess.run(['launchctl', 'bootstrap', f'gui/{os.getuid()}', str(plist)], capture_output=True)
            raise
        manager.errors.pop(key, None)
        return manager.state()
