"""Application-owned environment drafts and installed-app discovery."""
import json
import sys
import threading
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4


def installed_apps():
    if sys.platform != 'darwin': return []
    roots = [Path('/Applications'), Path.home()/'Applications', Path.home()/'Desktop']
    names = [('claude', 'Claude.app'), ('switcher', 'Claude切换器.app'),
             ('ccbaga', 'CCBaga.app'), ('ccbaga-a', 'CCBaga-A.app'),
             ('ccbaga-b', 'CCBaga-B.app'), ('chrome', 'Google Chrome.app')]
    return [{'id': key, 'name': name[:-4], 'path': str(path)}
            for key, name in names
            for path in [next((root/name for root in roots if (root/name).is_dir()), None)]
            if path is not None]


class EnvironmentSettings:
    def __init__(self, directory):
        self.path = Path(directory)/'environments.json'
        self.lock = threading.RLock()

    def read(self):
        with self.lock:
            value = json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else {}
            return {'profiles': value.get('profiles', []), 'proxies': value.get('proxies', []),
                    'apps': installed_apps()}

    def change(self, value):
        if not isinstance(value, dict): raise ValueError('环境配置格式无效')
        collection, action = value.get('collection'), value.get('action')
        if collection not in ('profiles', 'proxies') or action not in ('save', 'delete'):
            raise ValueError('环境配置操作无效')
        with self.lock:
            current = self.read()
            if action == 'delete':
                key = value.get('id')
                if not isinstance(key, str) or not key: raise ValueError('请选择配置')
                if collection == 'proxies' and any(item['proxy_id'] == key for item in current['profiles']):
                    raise ValueError('此代理已被环境配置引用，请先调整对应环境')
                current[collection] = [item for item in current[collection] if item['id'] != key]
            else:
                item = self.validate(collection, value.get('item'), current)
                if any(row['id'] == item['id'] for row in current[collection]):
                    current[collection] = [item if row['id'] == item['id'] else row for row in current[collection]]
                else:
                    current[collection].append(item)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix('.tmp')
            temporary.write_text(json.dumps({key: current[key] for key in ('profiles', 'proxies')},
                                             ensure_ascii=False, indent=2), encoding='utf-8')
            temporary.replace(self.path)
            return current

    def validate(self, collection, item, current):
        fields = {'name', 'url'} if collection == 'proxies' else {
            'name', 'provider', 'engine', 'proxy_id', 'locale', 'timezone', 'fingerprint_seed'}
        if not isinstance(item, dict) or set(item)-{'id'} != fields:
            raise ValueError('环境配置字段无效')
        if any(not isinstance(item[key], str) or len(item[key]) > 2048 or any(ord(c) < 32 for c in item[key]) for key in fields):
            raise ValueError('配置内容无效或过长')
        if not item['name'].strip(): raise ValueError('请填写名称')
        key = item.get('id') or str(uuid4())
        if not isinstance(key, str) or len(key) > 100: raise ValueError('配置标识无效')
        if collection == 'proxies':
            url = urlparse(item['url'])
            if url.scheme not in ('http', 'https', 'socks5', 'socks5h') or not url.hostname or not url.port:
                raise ValueError('请填写带端口的 HTTP、HTTPS、SOCKS5 或 SOCKS5h 代理地址')
        else:
            if item['provider'] not in ('claude', 'codex') or item['engine'] not in ('ccbaga', 'chrome'):
                raise ValueError('请选择 Agent 和浏览器')
            if not all(item[key].strip() for key in ('locale', 'timezone', 'fingerprint_seed')):
                raise ValueError('请独立设置语言、时区与指纹种子')
            if item['proxy_id'] and not any(row['id'] == item['proxy_id'] for row in current['proxies']):
                raise ValueError('所选代理不存在，请重新选择')
        return {**item, 'id': key}
