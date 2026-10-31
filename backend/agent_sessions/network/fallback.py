"""Sticky ordered fallback; route changes restart clients in their existing data dirs."""
from datetime import datetime, timezone
import json
import threading
import time
from agent_sessions.private_files import private_json
from .fallback_plan import chain
from .fallback_health import probe

INTERVAL = 20
FAILURES = 3


def now():
    return datetime.now(timezone.utc).isoformat()


class ProbeFailure(ValueError):
    def __init__(self, result):
        super().__init__(result['error'])
        self.transport_failed = result.get('transport_failed', True)


class NodeFallbacks:
    def __init__(self, manager):
        self.manager = manager
        self.path = manager.directory/'network-fallback.json'
        self.lock = threading.RLock()
        saved = json.loads(self.path.read_text()) if self.path.is_file() else {}
        self.selected, self.exits = saved.get('selected', {}), saved.get('exits', {})
        self.status, self.switching = {}, set()
        self.closed = manager.closed

    def save(self):
        private_json(self.path, {'selected': self.selected, 'exits': self.exits})

    def update(self, key, **fields):
        with self.lock:
            self.status.setdefault(key, {}).update(fields)

    def state(self, lines):
        with self.lock:
            return [{**self.status.get(row['id'], {}), 'id': row['id'],
                     'current_id': self.selected.get(row['id'], row['id']),
                     'chain': [item['id'] for item in chain(lines, row['id'])],
                     'switching': row['id'] in self.switching}
                    for row in lines if row.get('fallback_ids')]

    def binding(self, keys):
        with self.lock:
            return {key: {'selected': self.selected.get(key, key),
                          'exit': self.exits.get(self.selected.get(key, key), {}).get('ip', '')}
                    for key in keys}

    def background_route(self, profile, root):
        with self.lock:
            if self.switching: raise ValueError('正在切换账号出口，请稍后查询')
            selected = self.selected.get(root['id'], root['id'])
            exit = dict(self.exits.get(selected, {}))
        plan = chain(self.manager.environments.read()['proxies'], root['id'])
        actual = next((row for row in plan if row['id'] == selected), root)
        if actual['id'] == root['id']: return profile, root
        if not exit.get('ip'): raise ValueError('备用出口尚未验证，请先启动账号环境')
        return {**profile, 'expected_ip': exit['ip']}, actual

    def forget(self, key):
        with self.lock:
            self.exits.pop(key, None)
            self.selected = {root: current for root, current in self.selected.items()
                             if root != key and current != key}
            self.status.clear()
            self.save()

    def reconcile(self, lines):
        with self.lock:
            keys = {row['id'] for row in lines}
            self.selected = {root: selected for root, selected in self.selected.items()
                             if root in keys and selected in {row['id'] for row in chain(lines, root)}}
            self.status.clear()
            self.save()

    def check_candidate(self, line, country='', expected=''):
        result = probe(line)
        if not result['ok']: raise ProbeFailure(result)
        with self.lock:
            old = self.exits.get(line['id'], {})
            pinned = expected or old.get('ip', '')
            if pinned and result['ip'] != pinned:
                raise ValueError('出口 IP 已变化，请重新配置并确认此节点')
            if country and result['country'] != country:
                raise ValueError('备用节点与当前环境的国家不同，未执行切换')
            self.exits[line['id']] = {**result, 'checked_at': now()}
            self.save()
        return result

    def resolve(self, profile, root, run):
        lines = self.manager.environments.read()['proxies']
        plan = chain(lines, root['id'])
        if len(plan) == 1: return profile, root
        with self.lock: selected = self.selected.get(root['id'], root['id'])
        others = [(runtime, item, active) for runtime, item, active in self.active(root['id'])
                  if item['id'] != profile['id']]
        if others:
            routes = {active.get('route', {}).get('proxy_id', selected) for _, _, active in others}
            if len(routes) != 1: raise ValueError('当前环境出口不一致，请先停止并重新启动')
            selected = routes.pop()
        start = next((i for i, row in enumerate(plan) if row['id'] == selected), 0)
        errors = []
        with self.lock: country = self.exits.get(root['id'], {}).get('country', '')
        if others:
            country = next((active.get('resolved', {}).get('country') for _, _, active in others
                            if active.get('resolved', {}).get('country')), country)
        # Never let a second client silently choose a different exit from a live sibling.
        for candidate in (plan[start:start+1] if others else plan[start:]):
            if self.closed.is_set() or run.get('cancelled'): raise ValueError('已取消节点检查')
            run['stage'] = '正在检查节点：'+candidate['name']
            try:
                result = self.check_candidate(candidate, country,
                    profile.get('expected_ip', '') if candidate['id'] == root['id'] else '')
            except (ValueError, OSError) as error:
                errors.append(candidate['name']+'：'+str(error)); continue
            if self.closed.is_set() or run.get('cancelled'): raise ValueError('已取消节点检查')
            with self.lock:
                self.selected[root['id']] = candidate['id']
                self.save()
            backup = candidate['id'] != root['id']
            run['route'] = {'root_id': root['id'], 'proxy_id': candidate['id'],
                            'root_name': root['name'], 'proxy_name': candidate['name'],
                            'clash_node': candidate['clash_node'], 'backup': backup,
                            'attempts': errors}
            self.update(root['id'], state='backup' if backup else 'healthy', failures=0,
                        message='正在使用备用节点：'+candidate['name'] if backup else '主节点连接正常',
                        checked_at=now())
            # Pins remain stored on the original profile; only this verified run uses the backup pin.
            return ({**profile, 'expected_ip': result['ip']} if backup else profile), candidate
        self.update(root['id'], state='exhausted', message='；'.join(errors), checked_at=now())
        raise ValueError('回退链没有可用节点；'+'；'.join(errors))

    def active(self, root_id):
        settings = self.manager.environments.read()
        result = []
        for collection, runtime in self.manager.runtimes:
            for profile in settings[collection]:
                if profile['proxy_id'] != root_id: continue
                run = runtime.runs.get(profile['id'], {})
                process = runtime.processes.get(profile['id'])
                if run.get('status') == 'checking' or process and process.poll() is None:
                    result.append((runtime, profile, run))
        return result

    def switch(self, key, target, automatic=False):
        with self.manager.lock: self._begin_switch(key, target, automatic)

    def _begin_switch(self, key, target, automatic):
        settings = self.manager.environments.read()
        root = next((row for row in settings['proxies'] if row['id'] == key), None)
        if not root or not root.get('fallback_ids'): raise ValueError('请先配置备用节点')
        if automatic and root.get('fallback_mode') != 'automatic': return
        if target not in ('next', 'primary'): raise ValueError('请选择下一备用或主节点')
        with self.lock:
            if self.switching: raise ValueError('正在切换节点，请稍候')
            if any(run.get('status') == 'checking' for _, _, run in self.active(key)):
                raise ValueError('环境正在启动，请等待检查完成')
            self.switching.add(key)
        self.update(key, state='switching', message='正在检测可用节点，随后重启环境')
        threading.Thread(target=self._switch, args=(root, target, automatic), daemon=True).start()

    def _switch(self, root, target, automatic):
        from .fallback_switch import switch
        try: switch(self, root, target, automatic)
        except Exception as error:
            self.update(root['id'], state='exhausted', message=str(error), checked_at=now())
        finally:
            with self.lock: self.switching.discard(root['id'])

    def watch(self):
        while not self.closed.wait(INTERVAL):
            settings = self.manager.environments.read()
            for root in settings['proxies']:
                active = self.active(root['id'])
                if not root.get('fallback_ids') or not active: continue
                if any(run.get('status') != 'running' for _, _, run in active): continue
                with self.lock:
                    if self.switching: continue
                    selected = self.selected.get(root['id'], root['id'])
                    status = dict(self.status.get(root['id'], {}))
                current = next((row for row in settings['proxies'] if row['id'] == selected), root)
                try:
                    self.check_candidate(current)
                    self.update(root['id'], state='backup' if selected != root['id'] else 'healthy',
                                failures=0, message='当前节点连接正常', checked_at=now())
                    continue
                except (ValueError, OSError) as error:
                    connection_failure = isinstance(error, OSError) or isinstance(error, ProbeFailure) and error.transport_failed
                    failures = status.get('failures', 0)+1 if connection_failure else 0
                    self.update(root['id'], state='degraded', failures=failures,
                                message=('当前节点连续连接失败：' if connection_failure else '出口检查待确认：')+str(error), checked_at=now())
                if (failures >= FAILURES and root.get('fallback_mode') == 'automatic'
                        and time.monotonic()-status.get('last_attempt', 0) >= 60):
                    self.update(root['id'], last_attempt=time.monotonic())
                    try: self.switch(root['id'], 'next', automatic=True)
                    except ValueError as error: self.update(root['id'], message=str(error))
