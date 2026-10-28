"""Refresh only a named subscription node, deferring live connection changes."""
from copy import deepcopy
import threading
import time
from .config import configuration
from .imports import parse_nodes
from .process import private_json

INTERVALS = (0, 1, 6, 24)


def settings(url, node, interval=6, previous=None):
    if type(interval) is not int or interval not in INTERVALS: raise ValueError('请选择关闭、每小时、每 6 小时或每天更新')
    if not url:
        if interval: raise ValueError('自动更新需要订阅链接，请先导入订阅')
        return None
    return {**(previous or {}), 'url': url, 'node_name': node['name'], 'interval_hours': interval}


class SubscriptionUpdates:
    def __init__(self, manager):
        self.manager = manager
        self.closed = threading.Event()
        self.busy = set()
        self.thread = None
        self.can_apply = lambda key, ignored=None: False

    def start(self, can_apply):
        self.can_apply = can_apply
        if self.thread: return
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def close(self):
        self.closed.set()

    def public(self, key, entry):
        value = entry.get('subscription')
        if not value: return None
        return {field: value.get(field) for field in ('url', 'node_name', 'interval_hours', 'last_checked', 'last_updated', 'error')} | {
            'status': 'updating' if key in self.busy else 'error' if value.get('error') else 'pending' if value.get('pending_node') else 'current'}

    def refresh(self, key):
        with self.manager.lock:
            value = self.manager.definition(key).get('subscription')
            if not value: raise ValueError('此代理未保存订阅链接，请先导入订阅')
            if key in self.busy: return
            self.busy.add(key)
            snapshot = deepcopy(value)
        threading.Thread(target=self._refresh, args=(key, snapshot), daemon=True).start()

    def _refresh(self, key, snapshot):
        error, node = '', None
        try:
            nodes = [row for row in parse_nodes(snapshot['url']) if row['name'] == snapshot['node_name']]
            if len(nodes) != 1:
                raise ValueError('订阅中未找到唯一的所选节点「'+snapshot['node_name']+'」，请重新选择节点')
            node = nodes[0]
        except (ValueError, OSError) as reason: error = str(reason)
        try:
            with self.manager.lock:
                if self.closed.is_set(): return
                entry = self.manager.definition(key)
                value = entry.get('subscription', {})
                if value != snapshot: return  # Settings changed while the download was in progress.
                value.update(last_checked=time.time(), error=error)
                if not error:
                    self.manager.validate(key, {**entry, 'node': node})
                    value.pop('pending_node', None)
                    if node != entry['node']: value['pending_node'] = node
                    else: value['last_updated'] = time.time()
                private_json(self.manager.entry_directory(key)/'definition.json', entry)
                if not error: self.apply(key)
        except (ValueError, OSError) as reason:
            self._error(key, snapshot, str(reason))
        finally:
            with self.manager.lock: self.busy.discard(key)

    def _error(self, key, snapshot, message):
        try:
            with self.manager.lock:
                entry = self.manager.definition(key)
                value = entry.get('subscription', {})
                if value.get('url') != snapshot['url'] or value.get('node_name') != snapshot['node_name']: return
                value.update(last_checked=time.time(), error=message)
                private_json(self.manager.entry_directory(key)/'definition.json', entry)
        except (OSError, ValueError): pass  # The user may have removed the entry.

    def apply(self, key, ignored=None):
        with self.manager.lock:
            entry = self.manager.definition(key)
            value = entry.get('subscription', {})
            if not value.get('pending_node') or value.get('error') or not self.can_apply(key, ignored): return
            previous = deepcopy(entry)
            entry['node'] = value.pop('pending_node')
            self.manager.validate(key, entry)
            process = self.manager.process(key)
            running = process.alive()
            process.stop()
            private_json(self.manager.entry_directory(key)/'config.json', configuration(entry))
            try:
                if running: process.start(entry['port'])
            except (ValueError, OSError):
                private_json(self.manager.entry_directory(key)/'config.json', configuration(previous))
                if running: process.start(previous['port'])
                raise
            value.update(last_updated=time.time(), error='')
            private_json(self.manager.entry_directory(key)/'definition.json', entry)

    def tick(self):
        with self.manager.lock:
            for item in self.manager.environments.read()['proxies']:
                if item.get('kind') != 'managed': continue
                key = item['id']
                value = None
                try:
                    entry = self.manager.definition(key)
                    value = entry.get('subscription')
                    if not value: continue
                    self.apply(key)
                    interval = value['interval_hours']
                    if interval and time.time()-value.get('last_checked', 0) >= interval*3600:
                        self.refresh(key)
                except (ValueError, OSError) as error:
                    if value: self._error(key, value, str(error))

    def _run(self):
        while not self.closed.is_set():
            self.tick()
            self.closed.wait(15)
