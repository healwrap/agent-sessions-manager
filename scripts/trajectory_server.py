#!/usr/bin/env python3
"""Read-only local API and desktop sidecar for Agent Sessions."""
import argparse
import json
import mimetypes
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from codex_source import Store, PAGE_CHARS, timestamp_ms
from session_locator import codex_root

ASSETS = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent.parent)) / 'assets' / 'trajectory'

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Do not duplicate session titles, paths or query text into a service log.
        pass

    def respond(self, status, body, mime='application/json; charset=utf-8'):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            host = self.headers.get('Host', '')
            expected = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
            origin = self.headers.get('Origin')
            if host not in expected or self.headers.get('Sec-Fetch-Site') == 'cross-site' or (origin and origin != f'http://{host}'):
                self.respond(403, {'error': '仅允许本机页面访问'})
                return
            parsed = urlparse(self.path)
            q = parse_qs(parsed.query)
            get = lambda name, default='': q.get(name, [default])[0]
            integer = lambda name, default, low, high: max(low, min(high, int(get(name, str(default)))))
            if parsed.path == '/api/health':
                result = {'ready': True, 'application': 'Agent Sessions'}
            elif parsed.path == '/api/preferences':
                result = self.server.settings.read() if hasattr(self.server, 'settings') else {'saved': False, 'value': {}}
            elif parsed.path == '/api/sources':
                result = self.server.store.sources()
            elif parsed.path == '/api/sessions':
                args = (get('q'), integer('offset', 0, 0, 1_000_000), integer('limit', 30, 1, 100), get('project'))
                result = self.server.store.sessions(*args, get('provider')) if hasattr(self.server.store, 'catalogue') else self.server.store.sessions(*args)
            elif parsed.path == '/api/trajectory':
                result = self.server.store.trajectory(get('id'), integer('offset', 0, 0, 1_000_000), integer('limit', 150, 1, 250), get('q'), get('kind', 'all'))
            elif parsed.path == '/api/event':
                part = get('part', 'input')
                if part not in {'input', 'output'}:
                    raise ValueError('内容类型无效')
                result = self.server.store.detail(get('id'), get('ref'), integer('page', 1, 1, 1_000_000), part)
            elif parsed.path == '/api/trajectory-focus':
                result = self.server.store.focus(get('id'), float(get('start')), float(get('end')), get('mode', 'position'))
            else:
                name = {'/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css',
                        '/harness.css': 'harness.css', '/harness-wordmark.svg': 'harness-wordmark.svg',
                        '/harness-license.txt': 'harness-license.txt', '/marked.js': 'marked.js',
                        '/icons.svg': 'icons.svg',
                        '/marked-license.txt': 'marked-license.txt'}.get(parsed.path)
                if not name:
                    raise FileNotFoundError('页面不存在')
                path = ASSETS / name
                self.respond(200, path.read_bytes(), (mimetypes.guess_type(name)[0] or 'text/plain')+'; charset=utf-8')
                return
            self.respond(200, result)
        except FileNotFoundError as exc:
            self.respond(404, {'error': str(exc)})
        except (ValueError, OSError) as exc:
            self.respond(400, {'error': str(exc)})
        except Exception:
            self.respond(500, {'error': '读取失败，请刷新并查看会话格式警告'})

    def do_POST(self):
        if self.path != '/api/preferences' or not hasattr(self.server, 'settings'):
            self.respond(501, {'error': '此接口不支持写入'}); return
        host = self.headers.get('Host', '')
        if host != f'127.0.0.1:{self.server.server_port}' and host != f'localhost:{self.server.server_port}':
            self.respond(403, {'error': '仅允许本机页面访问'}); return
        if self.headers.get('Sec-Fetch-Site') == 'cross-site' or self.headers.get('Origin', f'http://{host}') != f'http://{host}':
            self.respond(403, {'error': '仅允许本机页面访问'}); return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 2_000_000: raise ValueError('会话视图设置过大')
            value = json.loads(self.rfile.read(length))
            self.respond(200, self.server.settings.write(value))
            if hasattr(self.server.store, 'catalogue_time'): self.server.store.catalogue_time = 0
        except (ValueError, OSError) as error:
            self.respond(400, {'error': str(error)})


def main():
    parser = argparse.ArgumentParser(description='打开 Agent Sessions 本地会话应用')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--codex-home', type=Path, default=codex_root())
    parser.add_argument('--claude-home', type=Path, default=Path.home()/'.claude')
    parser.add_argument('--antigravity-home', type=Path, default=Path.home()/'.gemini/antigravity')
    parser.add_argument('--antigravity-cli-home', type=Path, default=Path.home()/'.gemini/antigravity-cli')
    parser.add_argument('--codex-only', action='store_true')
    parser.add_argument('--desktop', action='store_true')
    parser.add_argument('--state-home', type=Path, default=Path.home()/'Library/Application Support/Agent Sessions' if sys.platform == 'darwin' else Path.home()/'.local/share/agent-sessions')
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.daemon_threads = True
    from view_settings import ViewSettings
    server.settings = ViewSettings(args.state_home)
    if args.codex_only:
        server.store = Store(args.codex_home)
    else:
        from agent_sources import MultiStore
        server.store = MultiStore(args.codex_home, args.claude_home, args.antigravity_home, args.antigravity_cli_home)
        server.store.settings = server.settings
    print(f'http://127.0.0.1:{server.server_port}/', flush=True)
    if args.desktop:
        # The owning app closes stdin on exit; do not leave an orphan service.
        def owner_closed():
            sys.stdin.buffer.read()
            server.shutdown()
        threading.Thread(target=owner_closed, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
