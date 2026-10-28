"""Compare observed identifiers without changing an application's identity or login state."""
import base64
import json
import threading
import time
from pathlib import Path
from .profile_ownership import directory


class IdentityConflict(ValueError):
    pass


class ProfileIdentity:
    def __init__(self, root):
        self.root = Path(root)
        self.path = self.root/'isolation/browser-observations.json'
        self.lock = threading.RLock()
        self.account_checks = {}

    def app(self, key):
        root = directory(self.root, 'app_profiles', key)
        result = {}
        path = root/'ant-did'
        if path.is_file(): result['ant-did'] = base64.b64decode(path.read_text().strip(), validate=True).decode()
        path = root/'claude-code/.claude.json'
        if path.is_file():
            value = json.loads(path.read_text())
            for name in ('userID', 'machineID'):
                if value.get(name): result['code-'+name] = value[name]
        path = root/'config.json'
        if path.is_file():
            value = json.loads(path.read_text())
            if value.get('lastKnownAccountUuid'): result['account-uuid'] = value['lastKnownAccountUuid']
        return result

    def verify(self, settings, collection, key, values=None):
        root = directory(self.root, collection, key)
        with self.lock:
            path = self.path if collection == 'profiles' else self.path.with_name('app-observations.json')
            saved = json.loads(path.read_text()) if path.exists() else {}
            own = self.app(key) if collection == 'app_profiles' else (saved.get(key, {}) if values is None else values)
            previous = saved.get(key, {})
            if own.get('account-uuid') and previous.get('account-uuid') and own['account-uuid'] != previous['account-uuid']:
                raise IdentityConflict('此环境的实际登录账号已变化，请为新账号使用独立环境')
            duplicates = []
            for profile in settings[collection]:
                other = profile['id']
                if other == key: continue
                peer = directory(self.root, collection, other)
                if root.exists() and peer.exists() and root.resolve() == peer.resolve():
                    raise IdentityConflict('环境与“'+profile['name']+'”指向同一数据目录，请创建独立环境')
                known = self.app(other) if collection == 'app_profiles' else saved.get(other, {})
                for name, value in own.items():
                    peer_value = known.get(name)
                    same = bool(set(value) & set(peer_value or [])) if isinstance(value, list) else value == peer_value
                    if value and same: duplicates.append(name+'（'+profile['name']+'）')
            if duplicates: raise IdentityConflict('发现环境间重复的账号或设备标识：'+'、'.join(duplicates)+'；已保留原数据，请使用各自的独立环境')
            if collection == 'app_profiles' or values is not None:
                observation = {**previous, **own}
                if previous == observation: return own
                saved[key] = observation
                path.parent.mkdir(parents=True, exist_ok=True)
                temporary = path.with_suffix('.tmp')
                temporary.write_text(json.dumps(saved, ensure_ascii=False, indent=2))
                temporary.chmod(0o600)
                temporary.replace(path)
            return own

    def browser(self, settings, key, control):
        cookies = control.command('Storage.getCookies')['cookies']
        values = {}
        for name in ('anthropic-device-id', 'ajs_anonymous_id'):
            matches = sorted({row['value'] for row in cookies if row['name'] == name and row['value'] and
                              (row['domain'].lstrip('.') == 'claude.ai' or row['domain'].endswith('.claude.ai'))})
            if matches: values[name] = matches
        if time.monotonic()-self.account_checks.get(key, 0) >= 30:
            from .browser.web_session import WebSession
            targets = control.command('Target.getTargets')['targetInfos']
            for target in targets:
                if target['type'] == 'page' and target['url'].startswith('https://claude.ai/'):
                    account = WebSession(control).identity(target['targetId'])
                    if account.get('uuid'):
                        values['account-uuid'] = account['uuid']
                        self.account_checks[key] = time.monotonic()
                        break
        return self.verify(settings, 'profiles', key, values)
