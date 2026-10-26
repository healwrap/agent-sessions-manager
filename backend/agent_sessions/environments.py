"""Application-owned accounts, browser environments and proxy configurations."""
import ipaddress
import json
import sys
import threading
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from .browser.gates import definitions, DEFAULTS
from .browser.proxy import validate_proxy


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
                    'accounts': value.get('accounts', []), 'apps': installed_apps(), 'gate_definitions': definitions()}

    def change(self, value):
        if not isinstance(value, dict): raise ValueError('环境配置格式无效')
        collection, action = value.get('collection'), value.get('action')
        if collection not in ('profiles', 'proxies', 'accounts') or action not in ('save', 'delete'):
            raise ValueError('环境配置操作无效')
        with self.lock:
            current = self.read()
            if action == 'delete':
                key = value.get('id')
                if not isinstance(key, str) or not key: raise ValueError('请选择配置')
                if collection == 'proxies' and any(item['proxy_id'] == key for item in current['profiles']):
                    raise ValueError('此代理已被环境配置引用，请先调整对应环境')
                if collection == 'profiles' and any(item['profile_id'] == key for item in current['accounts']):
                    raise ValueError('此环境已绑定账号，请先调整账号绑定')
                current[collection] = [item for item in current[collection] if item['id'] != key]
            else:
                item = self.validate(collection, value.get('item'), current)
                if any(row['id'] == item['id'] for row in current[collection]):
                    current[collection] = [item if row['id'] == item['id'] else row for row in current[collection]]
                else:
                    current[collection].append(item)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix('.tmp')
            temporary.write_text(json.dumps({key: current[key] for key in ('profiles', 'proxies', 'accounts')},
                                             ensure_ascii=False, indent=2), encoding='utf-8')
            temporary.replace(self.path)
            return current

    def validate(self, collection, item, current):
        required = {'proxies': {'name', 'url'}, 'accounts': {'name', 'provider', 'profile_id'},
                    'profiles': {'name', 'provider', 'engine', 'proxy_id', 'locale', 'timezone', 'fingerprint_seed'}}[collection]
        optional = {'locale_mode', 'timezone_mode', 'expected_ip', 'gates'} if collection == 'profiles' else set()
        if not isinstance(item, dict) or not required <= set(item) <= required | optional | {'id'}:
            raise ValueError('环境配置字段无效')
        fields = set(item)-{'gates'}
        if any(not isinstance(item[key], str) or len(item[key]) > 2048 or any(ord(c) < 32 for c in item[key]) for key in fields):
            raise ValueError('配置内容无效或过长')
        if not item['name'].strip(): raise ValueError('请填写名称')
        key = item.get('id') or str(uuid4())
        if not isinstance(key, str) or len(key) > 100: raise ValueError('配置标识无效')
        if collection == 'proxies':
            validate_proxy(item['url'])
        elif collection == 'accounts':
            if item['provider'] not in ('claude', 'codex'): raise ValueError('请选择账号类型')
            profile = next((row for row in current['profiles'] if row['id'] == item['profile_id']), None)
            if not profile: raise ValueError('请绑定已保存的浏览器环境')
            if profile['provider'] != item['provider']: raise ValueError('账号与环境的 Agent 类型应一致')
            if any(row['profile_id'] == item['profile_id'] and row['id'] != key for row in current['accounts']):
                raise ValueError('此环境已绑定其他账号，请为新账号创建独立环境')
        else:
            if item['provider'] not in ('claude', 'codex') or item['engine'] not in ('ccbaga', 'chrome', 'fingerprint-chromium'):
                raise ValueError('请选择 Agent 和浏览器')
            if any(row['profile_id'] == key and row['provider'] != item['provider'] for row in current['accounts']):
                raise ValueError('此环境已绑定账号，Agent 类型应与账号一致')
            if not all(item[key].strip() for key in ('locale', 'timezone', 'fingerprint_seed')):
                raise ValueError('请独立设置语言、时区与指纹种子')
            if item['proxy_id'] and not any(row['id'] == item['proxy_id'] for row in current['proxies']):
                raise ValueError('所选代理不存在，请重新选择')
            if any(item.get(field, 'manual') not in ('manual', 'proxy') for field in ('locale_mode', 'timezone_mode')):
                raise ValueError('请选择手动设置或跟随代理出口')
            try: ZoneInfo(item['timezone'])
            except (ZoneInfoNotFoundError, ValueError): raise ValueError('请填写有效 IANA 时区') from None
            if item.get('expected_ip'):
                try: ipaddress.ip_address(item['expected_ip'])
                except ValueError: raise ValueError('指定出口 IP 格式无效') from None
            gates = item.get('gates', {})
            if not isinstance(gates, dict) or set(gates)-set(DEFAULTS) or any(mode not in ('block', 'warn', 'off') for mode in gates.values()):
                raise ValueError('启动门控策略无效')
        return {**item, 'id': key}
