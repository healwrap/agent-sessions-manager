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
from agent_sessions.sources.message_images import image_links, message_image_bytes

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
        extra_connect = ' https://claude.ai https://www.cloudflare.com https://api.ipify.org' if urlparse(self.path).path == '/browser-check.html' else ''
        self.send_header('Content-Security-Policy', f"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'{extra_connect}; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            host = self.headers.get('Host', '')
            expected = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
            origin = self.headers.get('Origin')
            parsed = urlparse(self.path)
            probe_navigation = parsed.path == '/browser-check.html' and self.headers.get('Sec-Fetch-Dest') == 'document'
            if host not in expected or (not probe_navigation and (self.headers.get('Sec-Fetch-Site') == 'cross-site' or (origin and origin != f'http://{host}'))):
                self.respond(403, {'error': '仅允许本机页面访问'})
                return
            q = parse_qs(parsed.query)
            get = lambda name, default='': q.get(name, [default])[0]
            integer = lambda name, default, low, high: max(low, min(high, int(get(name, str(default)))))
            if parsed.path == '/api/health':
                result = {'ready': True, 'application': 'Agent Sessions', 'manager_protocol': 2,
                          'shared_state': self.server.app_settings.path.parent.resolve() == state_root().resolve()}
            elif parsed.path == '/api/preferences':
                result = self.server.settings.read() if hasattr(self.server, 'settings') else {'saved': False, 'value': {}}
            elif parsed.path == '/api/settings':
                result = {'value': self.server.app_settings.read(), 'defaults': self.server.app_settings.defaults,
                          'sources': self.server.store.sources()['items']}
            elif parsed.path == '/api/claude-diagnostics/history':
                result = {'history': self.server.claude_diagnostics.history()}
            elif parsed.path == '/api/environments/app-check':
                from agent_sessions.diagnostics.local import inspect_app
                config = self.server.app_settings.read()
                result = {'checks': inspect_app(Path(config['paths']['claude:local']))}
            elif parsed.path.startswith('/api/browser-checks/'):
                result = self.server.browser_diagnostics.read(parsed.path.rsplit('/', 1)[-1])
            elif parsed.path == '/api/app-runtime':
                result = self.server.app_runtime.state()
            elif parsed.path == '/api/browser-runtime':
                result = self.server.browser_runtime.state()
            elif parsed.path == '/api/environments':
                result = {**self.server.environments.read(), 'browser': self.server.browser_runtime.state(), 'app_runtime': self.server.app_runtime.state()}
            elif parsed.path in ('/api/context-reference', '/api/handoff'):
                from agent_sessions.context.handoff import prompt
                result = prompt(self.server.store, get('id'), get('ref'), self.server.app_settings.path.parent)
            elif parsed.path == '/api/sources':
                result = self.server.store.sources()
            elif parsed.path == '/api/sessions':
                args = (get('q'), integer('offset', 0, 0, 1_000_000), integer('limit', 30, 1, 100), get('project'))
                subagents = get('subagents', '1')
                if subagents not in ('0', '1'): raise ValueError('子代理筛选选项无效')
                result = self.server.store.sessions(*args, get('provider'), get('search_mode', 'words'), subagents == '1') if hasattr(self.server.store, 'catalogue') else self.server.store.sessions(*args)
            elif parsed.path == '/api/trajectory':
                result = self.server.store.trajectory(get('id'), integer('offset', 0, 0, 1_000_000), integer('limit', 150, 1, 250), get('q'), get('kind', 'all'))
            elif parsed.path == '/api/session-family':
                result = self.server.store.session_family(get('id'), integer('offset', 0, 0, 1_000_000), integer('limit', 30, 1, 100), get('activity', '1') == '1')
            elif parsed.path == '/api/session-version':
                result = {'revision': self.server.store.revision(get('id'))}
            elif parsed.path == '/api/event':
                part = get('part', 'input')
                if part not in {'input', 'output', 'raw'}:
                    raise ValueError('内容类型无效')
                result = self.server.store.detail(get('id'), get('ref'), integer('page', 1, 1, 1_000_000), part)
                result = {**result, 'inline_images': image_links(result)}
            elif parsed.path == '/api/message-image':
                part = get('part', 'input')
                if part not in {'input', 'output'}: raise ValueError('内容类型无效')
                detail = self.server.store.detail(get('id'), get('ref'), integer('page', 1, 1, 1_000_000), part)
                body, mime = message_image_bytes(detail, get('href'))
                self.respond(200, body, mime)
                return
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
        runtime = self.path in {'/api/app-runtime/open', '/api/browser-runtime/open', '/api/app-runtime/start', '/api/app-runtime/stop', '/api/browser-kernel/install', '/api/browser-runtime/start', '/api/browser-runtime/stop', '/api/browser-runtime/region'}
        browser_probe = self.path.startswith('/api/browser-checks/')
        diagnostic = self.path in {'/api/claude-diagnostics/run', '/api/claude-diagnostics/clear'}
        if (self.path not in {'/api/preferences', '/api/settings', '/api/environments'} and not diagnostic and not browser_probe and not runtime) or not hasattr(self.server, 'settings'):
            self.respond(501, {'error': '此接口不支持写入'}); return
        host = self.headers.get('Host', '')
        if host != f'127.0.0.1:{self.server.server_port}' and host != f'localhost:{self.server.server_port}':
            self.respond(403, {'error': '仅允许本机页面访问'}); return
        if self.headers.get('Sec-Fetch-Site') == 'cross-site' or self.headers.get('Origin', f'http://{host}') != f'http://{host}':
            self.respond(403, {'error': '仅允许本机页面访问'}); return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 2_000_000: raise ValueError('会话视图设置过大')
            if diagnostic and (length > 4096 or self.headers.get_content_type() != 'application/json'):
                raise ValueError('检测参数应使用 JSON，大小不能超过 4 KB')
            if browser_probe and (length > 65536 or self.headers.get_content_type() != 'application/json'):
                raise ValueError('浏览器采样应使用 JSON，大小不能超过 64 KB')
            value = json.loads(self.rfile.read(length))
            if runtime:
                from agent_sessions.browser.api import command
                if self.path.startswith('/api/app-runtime/'):
                    if self.path.endswith('/start'): result = self.server.app_runtime.launch(value)
                    elif self.path.endswith('/open'): result = self.server.app_runtime.open(value)
                    else:
                        if not isinstance(value, dict) or set(value) != {'profile_id'}: raise ValueError('请选择 App 环境')
                        result = self.server.app_runtime.stop(value['profile_id'])
                    self.respond(200, result)
                else: self.respond(200, command(self.server, self.path, value))
            elif browser_probe:
                result = (self.server.browser_diagnostics.start(value) if self.path.endswith('/start') else
                          self.server.browser_diagnostics.complete(self.path.rsplit('/', 1)[-1], value))
                if self.path.endswith('/start'):
                    result['url'] = f"http://{host}/browser-check.html?ticket={result['token']}"
                self.respond(200, result)
            elif diagnostic:
                if self.path.endswith('/clear'):
                    self.respond(200, self.server.claude_diagnostics.clear())
                else:
                    result = self.server.claude_diagnostics.run(value)
                    self.respond(200, result)
            elif self.path == '/api/environments':
                self.server.browser_runtime.ensure_mutable(value)
                self.server.app_runtime.ensure_mutable(value)
                result = self.server.environments.change(value)
                self.respond(200, {**result, 'browser': self.server.browser_runtime.state(), 'app_runtime': self.server.app_runtime.state()})
            elif self.path == '/api/settings':
                config = self.server.app_settings.validate(value)
                previous = self.server.app_settings.read()
                changed = any(config[key] != previous[key] for key in ('paths', 'enabled'))
                store = configured_store(config, self.server.settings) if changed else self.server.store
                saved = self.server.app_settings.write(config)
                if changed:
                    old_index = getattr(self.server.store, 'search_index', None)
                    if old_index: old_index.close()
                    self.server.store = store
                self.respond(200, {'value': saved, 'sources': store.sources()['items']})
            else:
                self.respond(200, self.server.settings.write(value))
                if hasattr(self.server.store, 'catalogue_time'): self.server.store.catalogue_time = 0
        except (ValueError, OSError) as error:
            self.respond(400, {'error': str(error)})


def configured_store(config, preferences):
    from agent_sessions.sources.catalog import MultiStore
    store = MultiStore(paths={key: Path(path) for key, path in config['paths'].items()})
    store.settings = preferences
    store.disabled = {store.registry.public_source(key) for key, enabled in config['enabled'].items() if not enabled}
    return store


def main():
    parser = argparse.ArgumentParser(description='打开 Agent Sessions 本地会话应用')
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--codex-home', type=Path, default=codex_root())
    parser.add_argument('--claude-home', type=Path, default=claude_root())
    parser.add_argument('--claude-desktop-home', type=Path, default=claude_desktop_root())
    parser.add_argument('--dsh-home', type=Path, default=Path.home()/'.dsh')
    parser.add_argument('--cursor-home', type=Path, default=cursor_root())
    parser.add_argument('--antigravity-home', type=Path, default=Path.home()/'.gemini/antigravity')
    parser.add_argument('--antigravity-cli-home', type=Path, default=Path.home()/'.gemini/antigravity-cli')
    parser.add_argument('--source-path', action='append', default=[], metavar='SOURCE=PATH')
    parser.add_argument('--codex-only', action='store_true')
    parser.add_argument('--desktop', action='store_true')
    parser.add_argument('--state-home', type=Path, default=state_root())
    parser.add_argument('--read-session', default='')
    parser.add_argument('--read-action', choices=['status', 'outline', 'message', 'tools', 'evidence'], default='outline')
    parser.add_argument('--read-ref', default='')
    parser.add_argument('--read-through', default='')
    parser.add_argument('--read-from', default='', help='从指定消息开始读取上下文，包含该消息')
    parser.add_argument('--read-query', default='')
    parser.add_argument('--read-page', type=int, default=1)
    args = parser.parse_args()
    from agent_sessions.settings import ViewSettings, AppSettings
    preferences = ViewSettings(args.state_home)
    app_settings = AppSettings(args.state_home, (args.codex_home, args.claude_home, args.antigravity_home, args.antigravity_cli_home, args.claude_desktop_home, args.dsh_home, args.cursor_home))
    config = app_settings.read()
    for assignment in args.source_path:
        source, separator, raw = assignment.partition('=')
        if not separator or source not in config['paths']: parser.error('来源目录参数格式应为已注册的 SOURCE=PATH')
        path = Path(raw).expanduser()
        if not raw or not path.is_absolute(): parser.error('来源目录必须为绝对路径或 ~/ 开头')
        config['paths'][source] = str(path.resolve())
    store = Store(args.codex_home) if args.codex_only else configured_store(config, preferences)
    if args.read_session:
        if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
        if not 1 <= args.read_page <= 1_000_000: parser.error('页码无效')
        from agent_sessions.context.handoff import read
        try:
            result = read(store, args.read_session, args.read_action, args.read_ref, args.read_page, args.read_query, args.read_through, args.read_from)
            print(json.dumps(result, ensure_ascii=False, indent=2))
        except (ValueError, OSError) as error:
            parser.exit(1, str(error)+'\n')
        return
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.daemon_threads = True
    server.settings = preferences
    server.app_settings = app_settings
    server.store = store
    from agent_sessions.diagnostics.claude import ClaudeDiagnostics
    server.claude_diagnostics = ClaudeDiagnostics(args.state_home)
    from agent_sessions.environments import EnvironmentSettings
    server.environments = EnvironmentSettings(args.state_home)
    from agent_sessions.diagnostics.browser import BrowserDiagnostics
    server.browser_diagnostics = BrowserDiagnostics(server.environments)
    from agent_sessions.browser.runtime import BrowserRuntime
    server.browser_runtime = BrowserRuntime(args.state_home, server.environments, server.browser_diagnostics, f'http://127.0.0.1:{server.server_port}')
    from agent_sessions.desktop_client.runtime import AppRuntime
    server.app_runtime = AppRuntime(args.state_home, server.environments)
    print(f'http://127.0.0.1:{server.server_port}/', flush=True)
    if args.desktop:
        # The owning app closes stdin on exit; do not leave an orphan service.
        def owner_closed():
            sys.stdin.buffer.readline()
            server.shutdown()
        threading.Thread(target=owner_closed, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.app_runtime.close()
        server.browser_runtime.close()
        server.server_close()
        index = getattr(server.store, 'search_index', None)
        if index: index.close()


if __name__ == '__main__':
    main()
