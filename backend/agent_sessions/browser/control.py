"""Control only an application-owned browser through its loopback DevTools socket."""
import json
import threading
import time
from urllib.parse import urlsplit
import websocket


class BrowserControl:
    def __init__(self, directory, process, resolved, emulate=False):
        self.lock = threading.RLock()
        self.pending, self.sessions = {}, {}
        self.sequence, self.closed = 0, False
        self.resolved, self.emulate = resolved, emulate
        path = directory/'DevToolsActivePort'
        deadline = time.monotonic()+30
        while time.monotonic() < deadline:
            if process.poll() is not None: raise ValueError('浏览器在建立管理连接前已退出')
            try:
                port, route = path.read_text().splitlines()[:2]
                self.socket = websocket.create_connection(f'ws://127.0.0.1:{int(port)}{route}', timeout=1,
                                                         suppress_origin=True, http_no_proxy=['127.0.0.1', 'localhost'])
                break
            except (OSError, ValueError, websocket.WebSocketException): time.sleep(.1)
        else: raise ValueError('浏览器管理连接未在 30 秒内就绪；若有钥匙串提示，请先处理')
        threading.Thread(target=self._receive, daemon=True).start()
        self.user_agent = self.command('Browser.getVersion')['userAgent']
        self.command('Target.setAutoAttach', dict(autoAttach=True, waitForDebuggerOnStart=True, flatten=True))

    def command(self, method, params=None, session=None):
        event = threading.Event()
        with self.lock:
            if self.closed: raise ValueError('浏览器管理连接已关闭')
            self.sequence += 1
            identifier = self.sequence
            result = self.pending[identifier] = {'event': event}
            payload = {'id': identifier, 'method': method, 'params': params or {}}
            if session: payload['sessionId'] = session
            self.socket.send(json.dumps(payload))
        if not event.wait(8):
            with self.lock: self.pending.pop(identifier, None)
            raise ValueError('浏览器管理指令超时：'+method)
        if 'error' in result: raise ValueError(str(result['error']))
        return result.get('result', {})

    def _receive(self):
        try:
            while not self.closed:
                try: raw = self.socket.recv()
                except websocket.WebSocketTimeoutException: continue
                if not raw: break
                message = json.loads(raw)
                with self.lock:
                    result = self.pending.pop(message.get('id'), None)
                    if result is not None:
                        result.update(message)
                        result['event'].set()
                if message.get('method') == 'Target.attachedToTarget':
                    params = message['params']
                    if params['targetInfo']['type'] == 'page':
                        with self.lock:
                            item = self.sessions.setdefault(params['targetInfo']['targetId'], {'ready': threading.Event()})
                            item['session'] = params['sessionId']
                        threading.Thread(target=self._configure, args=(item,), daemon=True).start()
                    else:
                        threading.Thread(target=self.command, args=('Runtime.runIfWaitingForDebugger', {}, params['sessionId']), daemon=True).start()
        except (OSError, ValueError, websocket.WebSocketException): pass
        finally: self.close()

    def _configure(self, item):
        session = item['session']
        try:
            if self.emulate:
                self.command('Emulation.setTimezoneOverride', {'timezoneId': self.resolved['timezone']}, session)
                self.command('Emulation.setLocaleOverride', {'locale': self.resolved['locale']}, session)
            self.command('Runtime.runIfWaitingForDebugger', session=session)
        except ValueError as error:
            item['error'] = str(error)
            try: self.command('Runtime.runIfWaitingForDebugger', session=session)
            except ValueError: pass
        finally: item['ready'].set()

    def open(self, url, reuse=False):
        rows = self.command('Target.getTargets')['targetInfos']
        if reuse:
            host = urlsplit(url).hostname
            existing = next((row for row in rows if row['type'] == 'page' and urlsplit(row['url']).hostname == host), None)
            if existing:
                self.command('Target.activateTarget', {'targetId': existing['targetId']})
                return existing['targetId']
        blank = next((row for row in rows if row['type'] == 'page' and row['url'] == 'about:blank'), None)
        target = blank['targetId'] if blank else self.command('Target.createTarget', {'url': 'about:blank'})['targetId']
        with self.lock: item = self.sessions.setdefault(target, {'ready': threading.Event()})
        if not item['ready'].wait(10): raise ValueError('新标签页尚未应用环境设置')
        if item.get('error'): raise ValueError(item['error'])
        self.command('Page.navigate', {'url': url}, item['session'])
        self.command('Target.activateTarget', {'targetId': target})
        return target

    def pages(self):
        return [{'title': row['title'], 'url': row['url']} for row in self.command('Target.getTargets')['targetInfos']
                if row['type'] == 'page']

    def quit(self):
        try: self.command('Browser.close')
        except ValueError: pass

    def close(self):
        with self.lock:
            if self.closed: return
            self.closed = True
            for item in self.pending.values():
                item['error'] = '浏览器管理连接已关闭'
                item['event'].set()
            self.pending.clear()
        self.socket.close()
