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
from .account_profiles import COLLECTIONS, provision, put
from .applications import installed_apps
from .profile_ownership import owners, remember, validate_binding


class EnvironmentSettings:
    def __init__(self, directory):
        self.path = Path(directory)/'environments.json'
        self.lock = threading.RLock()

    def read(self):
        with self.lock:
            value = json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else {}
            return {'profiles': value.get('profiles', []), 'proxies': value.get('proxies', []),
                    'app_profiles': [{**row, 'inherit_skills': row.get('inherit_skills', True)} for row in value.get('app_profiles', [])],
                    'accounts': [{**row, 'app_profile_id': row.get('app_profile_id', '')} for row in value.get('accounts', [])],
                    'profile_owners': owners(value, self.path.parent),
                    'apps': installed_apps(self.path.parent), 'gate_definitions': definitions()}

    def change(self, value):
        if not isinstance(value, dict): raise ValueError('环境配置格式无效')
        collection, action = value.get('collection'), value.get('action')
        if collection not in COLLECTIONS or action not in ('save', 'delete', 'provision') or (action == 'provision' and collection != 'accounts'):
            raise ValueError('环境配置操作无效')
        with self.lock:
            current = self.read()
            if action == 'provision':
                provision(value, current, self.validate)
            elif action == 'delete':
                key = value.get('id')
                if not isinstance(key, str) or not key: raise ValueError('请选择配置')
                if collection == 'proxies' and any(item['proxy_id'] == key for item in current['profiles']+current['app_profiles']):
                    raise ValueError('此代理已被环境配置引用，请先调整对应环境')
                field = 'profile_id' if collection == 'profiles' else 'app_profile_id'
                if collection in ('profiles', 'app_profiles') and any(item.get(field) == key for item in current['accounts']):
                    raise ValueError('此环境已绑定账号，请先调整账号绑定')
                current[collection] = [item for item in current[collection] if item['id'] != key]
            else:
                item = self.validate(collection, value.get('item'), current)
                put(current, collection, item)
            remember(current)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix('.tmp')
            temporary.write_text(json.dumps({key: current[key] for key in (*COLLECTIONS, 'profile_owners')},
                                             ensure_ascii=False, indent=2), encoding='utf-8')
            temporary.chmod(0o600)
            temporary.replace(self.path)
            return current

    def validate(self, collection, item, current):
        required = {'proxies': {'name', 'url'}, 'accounts': {'name', 'provider', 'profile_id'},
                    'profiles': {'name', 'provider', 'engine', 'proxy_id', 'locale', 'timezone', 'fingerprint_seed'},
                    'app_profiles': {'name', 'proxy_id', 'locale', 'timezone'}}[collection]
        optional = {'locale_mode', 'timezone_mode', 'expected_ip', 'expected_dns', 'gates'} if collection in ('profiles', 'app_profiles') else {'app_profile_id'} if collection == 'accounts' else set()
        if collection == 'app_profiles': optional |= {'inherit_skills'}
        if collection == 'proxies': optional |= {'kind'}
        if not isinstance(item, dict) or not required <= set(item) <= required | optional | {'id'}:
            raise ValueError('环境配置字段无效')
        fields = set(item)-{'gates', 'inherit_skills'}
        if 'inherit_skills' in item and type(item['inherit_skills']) is not bool:
            raise ValueError('本机 skills 继承开关无效')
        if any(not isinstance(item[key], str) or len(item[key]) > 2048 or any(ord(c) < 32 for c in item[key]) for key in fields):
            raise ValueError('配置内容无效或过长')
        if not item['name'].strip(): raise ValueError('请填写名称')
        key = item.get('id') or str(uuid4())
        if not isinstance(key, str) or len(key) > 100: raise ValueError('配置标识无效')
        if collection == 'proxies':
            if item.get('kind', 'external') not in ('external', 'managed'): raise ValueError('代理类型无效')
            validate_proxy(item['url'])
        elif collection == 'accounts':
            if item['provider'] not in ('claude', 'codex'): raise ValueError('请选择账号类型')
            if not item['profile_id'] and not item.get('app_profile_id'): raise ValueError('请绑定至少一个独立环境')
            for field, target in (('profile_id', 'profiles'), ('app_profile_id', 'app_profiles')):
                if not item.get(field): continue
                profile = next((row for row in current[target] if row['id'] == item[field]), None)
                if not profile: raise ValueError('绑定的环境不存在')
                validate_binding(current, target, item[field], key)
                if target == 'profiles' and profile['provider'] != item['provider']: raise ValueError('账号与环境的 Agent 类型应一致')
                if target == 'app_profiles' and item['provider'] != 'claude': raise ValueError('官方 App 环境适用于 Claude 账号')
                if any(row.get(field) == item[field] and row['id'] != key for row in current['accounts']):
                    raise ValueError('此环境已绑定其他账号，请为新账号创建独立环境')
        else:
            if collection == 'profiles' and (item['provider'] not in ('claude', 'codex') or item['engine'] not in ('ccbaga', 'chrome', 'fingerprint-chromium')):
                raise ValueError('请选择 Agent 和浏览器')
            if collection == 'profiles' and any(row['profile_id'] == key and row['provider'] != item['provider'] for row in current['accounts']):
                raise ValueError('此环境已绑定账号，Agent 类型应与账号一致')
            if not all(item[field].strip() for field in (('locale', 'timezone', 'fingerprint_seed') if collection == 'profiles' else ('locale', 'timezone'))):
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
            if item.get('expected_dns'):
                try:
                    addresses = [str(ipaddress.ip_address(value.strip())) for value in item['expected_dns'].split(',')]
                    if len(addresses) > 16: raise ValueError()
                    item = {**item, 'expected_dns': ','.join(addresses)}
                except ValueError: raise ValueError('预期 DNS 应填写最多 16 个 IP，以英文逗号分隔') from None
            gates = item.get('gates', {})
            if not isinstance(gates, dict) or set(gates)-set(DEFAULTS) or any(mode not in ('block', 'warn', 'off') for mode in gates.values()):
                raise ValueError('启动门控策略无效')
        return {**item, 'id': key}
