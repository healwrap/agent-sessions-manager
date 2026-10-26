"""Short-lived browser probe links; measurements originate in the target browser."""
from datetime import datetime, timezone
import secrets
import threading
import time


class BrowserDiagnostics:
    def __init__(self, environments):
        self.environments = environments
        self.lock = threading.RLock()
        self.tickets = {}

    def start(self, value, context=None):
        if not isinstance(value, dict) or set(value) != {'target'} or not isinstance(value['target'], str):
            raise ValueError('请选择检测的独立浏览器环境')
        context = context or {}
        target = value['target']
        settings = self.environments.read()
        expected = {}
        if target == 'external':
            name = '外部独立浏览器'
        elif target.startswith('profile:'):
            profile = next((row for row in settings['profiles'] if 'profile:'+row['id'] == target), None)
            if not profile: raise ValueError('此浏览器环境已不存在，请重新选择')
            name = profile['name']
            expected = {key: profile[key] for key in ('locale', 'timezone')}
        else:
            app = next((row for row in settings['apps'] if 'app:'+row['id'] == target
                        and (row['id'].startswith('ccbaga') or row['id'] == 'chrome')), None)
            if not app: raise ValueError('未找到此独立浏览器应用')
            name = app['name']
        with self.lock:
            now = time.monotonic()
            self.tickets = {key: row for key, row in self.tickets.items() if row['expires'] > now}
            if len(self.tickets) >= 32: self.tickets.pop(next(iter(self.tickets)))
            token = secrets.token_urlsafe(24)
            self.tickets[token] = {'target': target, 'name': name, 'expected': {**expected, **context.get('expected', {})},
                                   'launch': context.get('launch'), 'probe_options': context.get('probe_options', {}),
                                   'expires': now + 900, 'report': None}
            return self.read(token)

    def read(self, token):
        with self.lock:
            row = self.tickets.get(token)
            if not row or row['expires'] <= time.monotonic():
                raise ValueError('检测链接已失效，请在 Agent Sessions 中重新生成')
            return {'token': token, 'name': row['name'], 'expected': row['expected'],
                    'state': 'complete' if row['report'] else 'waiting', 'report': row['report'],
                    'launch': row['launch'], 'probe_options': row['probe_options']}

    def complete(self, token, value):
        with self.lock:
            self.read(token)
            row = self.tickets[token]
            if row['report']: raise ValueError('此链接已完成采样；重新检测请生成新链接')
            if not isinstance(value, dict) or set(value) != {'checks'} or not isinstance(value['checks'], list):
                raise ValueError('浏览器采样结果格式无效')
            checks = value['checks']
            allowed = {'window-timezone', 'window-language', 'window-ua', 'window-screen',
                       'canvas', 'webgl', 'webrtc', 'browser-http-ip', 'browser-cloudflare-ip'}
            ids = set()
            for item in checks:
                if (not isinstance(item, dict) or set(item) != {'id', 'title', 'state', 'value', 'detail', 'scope'}
                    or item.get('id') not in allowed or item['id'] in ids
                    or any(not isinstance(item.get(key), str) or len(item[key]) > 4096 for key in item)
                    or item['state'] not in {'pass', 'warn', 'fail', 'unknown', 'info'}):
                    raise ValueError('浏览器采样项目无效')
                ids.add(item['id'])
            if ids != allowed: raise ValueError('浏览器采样项目不完整')
            row['report'] = {'checked_at': datetime.now(timezone.utc).isoformat(), 'checks': checks}
            return self.read(token)

    def set_launch(self, token, result):
        with self.lock:
            self.read(token)
            self.tickets[token]['launch'] = result
            return self.read(token)
