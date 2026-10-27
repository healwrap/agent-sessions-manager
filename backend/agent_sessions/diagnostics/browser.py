"""Short-lived browser probe links; measurements originate in the target browser."""
from datetime import datetime, timezone
import secrets
import threading
import time
from .leaks import describe_leaks, valid_observation


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
            expected = {key: profile[key] for key in ('locale', 'timezone') if profile.get(key+'_mode', 'manual') == 'manual'}
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
                                   'expires': now + 900, 'report': None, 'error': ''}
            return self.read(token)

    def read(self, token):
        with self.lock:
            row = self.tickets.get(token)
            if not row or row['expires'] <= time.monotonic():
                raise ValueError('检测链接已失效，请在 Agent Sessions 中重新生成')
            return {'token': token, 'name': row['name'], 'expected': row['expected'],
                    'state': 'complete' if row['report'] else 'failed' if row['error'] else 'waiting',
                    'report': row['report'], 'error': row['error'],
                    'launch': row['launch'], 'probe_options': row['probe_options']}

    def complete(self, token, value):
        with self.lock:
            self.read(token)
            row = self.tickets[token]
            if row['error']: raise ValueError(row['error'])
            if row['report']: raise ValueError('此链接已完成采样；重新检测请生成新链接')
            if not isinstance(value, dict) or set(value) != {'checks'} or not isinstance(value['checks'], list):
                raise ValueError('浏览器采样结果格式无效')
            checks = value['checks']
            allowed = {'window-timezone', 'window-language', 'window-ua', 'window-screen',
                       'canvas', 'webgl', 'webrtc', 'dns', 'profile-storage', 'browser-http-ip', 'browser-cloudflare-ip'}
            ids = set()
            for item in checks:
                required = {'id', 'title', 'state', 'value', 'detail', 'scope'}
                if (not isinstance(item, dict) or not required <= set(item) or set(item) - required - {'label', 'observation'}
                    or item.get('id') not in allowed or item['id'] in ids
                    or any(not isinstance(item.get(key), str) or len(item[key]) > 4096 for key in required)
                    or item['state'] not in {'pass', 'warn', 'fail', 'unknown', 'info'}
                    or ('label' in item and (not isinstance(item['label'], str) or len(item['label']) > 80))
                    or ('observation' in item and (not valid_observation(item['observation']) or item['observation']['kind'] != item['id']))):
                    raise ValueError('浏览器采样项目无效')
                ids.add(item['id'])
            if ids != allowed: raise ValueError('浏览器采样项目不完整')
            row['report'] = {'checked_at': datetime.now(timezone.utc).isoformat(), 'checks': describe_leaks(checks)}
            return self.read(token)

    def set_launch(self, token, result):
        with self.lock:
            self.read(token)
            self.tickets[token]['launch'] = result
            return self.read(token)

    def set_expected(self, token, value):
        with self.lock:
            self.read(token)
            self.tickets[token]['expected'] = value

    def fail(self, token, error):
        with self.lock:
            row = self.tickets.get(token)
            if row and not row['report']: row['error'] = error

    def attach_run(self, token, run, error):
        with self.lock:
            self.read(token)
            row = self.tickets[token]
            row['error'] = error
            row['expected'] = {key: run['resolved'][key] for key in ('locale', 'timezone') if key in run['resolved']}
            row['launch'] = {'state': 'blocked' if run['status'] == 'blocked' else 'failed', 'checks': run['checks'], 'error': error}
            if run.get('browser_checks'):
                row['report'] = {'checked_at': run['checked_at'], 'checks': run['browser_checks']}
