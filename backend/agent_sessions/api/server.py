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
from urllib.parse import parse_qs, urlparse, unquote
from agent_sessions.sources.codex import Store, PAGE_CHARS, timestamp_ms
from agent_sessions.context.locator import codex_root
from agent_sessions.paths import claude_root, claude_desktop_root, cursor_root, state_root

ASSETS = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[3])) / 'frontend' / 'dist'

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
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
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
            elif parsed.path == '/api/settings':
                result = {'value': self.server.app_settings.read(), 'defaults': self.server.app_settings.defaults,
                          'sources': self.server.store.sources()['items']}
            elif parsed.path == '/api/handoff':
                from agent_sessions.context.handoff import prompt
                result = prompt(self.server.store, get('id'), get('ref'), self.server.app_settings.path.parent)
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
            elif parsed.path == '/api/attachment':
                part = get('part', 'output')
                if part not in {'input', 'output'}: raise ValueError('内容类型无效')
                body, mime = self.server.store.attachment(get('id'), get('ref'), integer('index', 0, 0, 10000), part)
                self.respond(200, body, mime)
                return
            elif parsed.path == '/api/trajectory-focus':
                result = self.server.store.focus(get('id'), float(get('start')), float(get('end')), get('mode', 'position'))
            else:
                name = 'index.html' if parsed.path == '/' else unquote(parsed.path).lstrip('/')
                path = (ASSETS / name).resolve()
                if not path.is_relative_to(ASSETS.resolve()) or not path.is_file():
                    raise FileNotFoundError('页面不存在')
                body = path.read_bytes()
                if name == 'index.html':
                    theme = self.server.app_settings.read()['theme'] if hasattr(self.server, 'app_settings') else 'system'
                    body = body.replace(b'data-theme-preference="system"', f'data-theme-preference="{theme}"'.encode()).replace(b'data-theme-canonical="false"', b'data-theme-canonical="true"')
                self.respond(200, body, (mimetypes.guess_type(name)[0] or 'application/octet-stream'))
                return
            self.respond(200, result)
        except FileNotFoundError as exc:
            self.respond(404, {'error': str(exc)})
        except (ValueError, OSError) as exc:
            self.respond(400, {'error': str(exc)})
        except Exception:
            self.respond(500, {'error': '读取失败，请刷新并查看会话格式警告'})

    def do_POST(self):
        if self.path not in {'/api/preferences', '/api/settings'} or not hasattr(self.server, 'settings'):
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
            if self.path == '/api/settings':
                config = self.server.app_settings.validate(value)
                store = configured_store(config, self.server.settings)
                saved = self.server.app_settings.write(config)
                self.server.store = store
                self.respond(200, {'value': saved, 'sources': store.sources()['items']})
            else:
                self.respond(200, self.server.settings.write(value))
                if hasattr(self.server.store, 'catalogue_time'): self.server.store.catalogue_time = 0
        except (ValueError, OSError) as error:
            self.respond(400, {'error': str(error)})


def configured_store(config, preferences):
    from agent_sessions.sources.catalog import MultiStore
    from agent_sessions.settings import SOURCE_KEYS
    store = MultiStore(*(Path(config['paths'][key]) for key in SOURCE_KEYS))
    store.settings = preferences
    store.disabled = {key for key in SOURCE_KEYS if not config['enabled'][key]}
    return store


def main():
    parser = argparse.ArgumentParser(description='打开 Agent Sessions 本地会话应用')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--codex-home', type=Path, default=codex_root())
    parser.add_argument('--claude-home', type=Path, default=claude_root())
    parser.add_argument('--claude-desktop-home', type=Path, default=claude_desktop_root())
    parser.add_argument('--dsh-home', type=Path, default=Path.home()/'.dsh')
    parser.add_argument('--cursor-home', type=Path, default=cursor_root())
    parser.add_argument('--antigravity-home', type=Path, default=Path.home()/'.gemini/antigravity')
    parser.add_argument('--antigravity-cli-home', type=Path, default=Path.home()/'.gemini/antigravity-cli')
    parser.add_argument('--codex-only', action='store_true')
    parser.add_argument('--desktop', action='store_true')
    parser.add_argument('--state-home', type=Path, default=state_root())
    parser.add_argument('--read-session', default='')
    parser.add_argument('--read-action', choices=['status', 'outline', 'message', 'tools', 'evidence'], default='outline')
    parser.add_argument('--read-ref', default='')
    parser.add_argument('--read-through', default='')
    parser.add_argument('--read-query', default='')
    parser.add_argument('--read-page', type=int, default=1)
    args = parser.parse_args()
    from agent_sessions.settings import ViewSettings, AppSettings
    preferences = ViewSettings(args.state_home)
    app_settings = AppSettings(args.state_home, (args.codex_home, args.claude_home, args.antigravity_home, args.antigravity_cli_home, args.claude_desktop_home, args.dsh_home, args.cursor_home))
    store = Store(args.codex_home) if args.codex_only else configured_store(app_settings.read(), preferences)
    if args.read_session:
        if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
        if not 1 <= args.read_page <= 1_000_000: parser.error('页码无效')
        from agent_sessions.context.handoff import read
        try:
            result = read(store, args.read_session, args.read_action, args.read_ref, args.read_page, args.read_query, args.read_through)
            print(json.dumps(result, ensure_ascii=False, indent=2))
        except (ValueError, OSError) as error:
            parser.exit(1, str(error)+'\n')
        return
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.daemon_threads = True
    server.settings = preferences
    server.app_settings = app_settings
    server.store = store
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
