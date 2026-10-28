"""Loopback CONNECT relay; credentials and upstream routing stay in this process."""
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import select
import socket
import ssl
import threading
from urllib.parse import unquote, urlsplit


def validate_proxy(value):
    if not isinstance(value, str) or any(c.isspace() or ord(c) < 32 for c in value):
        raise ValueError('代理地址不能包含空格或控制字符')
    try:
        parsed = urlsplit(value)
        if (parsed.scheme not in ('http', 'https', 'socks5', 'socks5h') or not parsed.hostname
                or not parsed.port or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
            raise ValueError()
    except ValueError:
        raise ValueError('请填写带端口的 HTTP、HTTPS、SOCKS5 或 SOCKS5h 代理地址') from None
    return parsed


def connect_upstream(url, host, port):
    if not url: return socket.create_connection((host, port), timeout=12)
    parsed = validate_proxy(url)
    if parsed.scheme != 'https':
        from python_socks.sync import Proxy
        return Proxy.from_url(url.replace('socks5h://', 'socks5://', 1), rdns=True).connect(
            dest_host=host, dest_port=port, timeout=12)
    connection = socket.create_connection((parsed.hostname, parsed.port), timeout=12)
    try:
        connection = ssl.create_default_context().wrap_socket(connection, server_hostname=parsed.hostname)
        authority = f'[{host}]:{port}' if ':' in host else f'{host}:{port}'
        headers = f'CONNECT {authority} HTTP/1.1\r\nHost: {authority}\r\n'
        if parsed.username is not None:
            credentials = f'{unquote(parsed.username)}:{unquote(parsed.password or "")}'.encode()
            headers += 'Proxy-Authorization: Basic '+base64.b64encode(credentials).decode()+'\r\n'
        connection.sendall((headers+'\r\n').encode())
        response = bytearray()
        while not response.endswith(b'\r\n\r\n') and len(response) < 65536:
            chunk = connection.recv(1)
            if not chunk: break
            response.extend(chunk)
        if not response.endswith(b'\r\n\r\n') or response.split(b'\r\n', 1)[0].split()[1:2] != [b'200']:
            raise OSError('上游 HTTPS 代理未建立隧道')
        return connection
    except Exception:
        connection.close()
        raise


class RelayHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    rbufsize = 0

    def log_message(self, *_args): pass

    def send_error(self, *args, **kwargs):
        try: super().send_error(*args, **kwargs)
        except (BrokenPipeError, ConnectionResetError): self.close_connection = True

    def tunnel(self, host, port, initial=b''):
        upstream = None
        try:
            dns_probe = any(host.lower().endswith('.'+domain) for domain in
                            ('dns4.browserleaks.org', 'dns6.browserleaks.org', 'dns4.browserleaks.net', 'dns6.browserleaks.net'))
            if not self.server.released and host.lower() not in {'api.ipify.org', 'www.cloudflare.com'} and not dns_probe:
                self.send_error(403, 'Account launch checks have not passed'); return
            upstream = connect_upstream(self.server.proxy_url, host, port)
            with self.server.connections_lock:
                self.server.connections.update((self.connection, upstream))
                self.server.observed_hosts.add(host.lower())
            if initial: upstream.sendall(initial)
            else:
                self.send_response(200, 'Connection Established')
                self.end_headers()
            self.connection.settimeout(None)
            upstream.settimeout(None)
            readers = [self.connection, upstream]
            while readers and not self.server.stopping:
                readable, _, _ = select.select(readers, [], [], 1)
                if upstream in readers and isinstance(upstream, ssl.SSLSocket) and upstream.pending() and upstream not in readable:
                    readable.append(upstream)
                for source in readable:
                    chunk = source.recv(65536)
                    if not chunk:
                        readers.remove(source)
                        try: (upstream if source is self.connection else self.connection).shutdown(socket.SHUT_WR)
                        except OSError: pass
                        continue
                    (upstream if source is self.connection else self.connection).sendall(chunk)
        except Exception:
            if upstream is None:
                self.send_error(502, 'Upstream proxy connection failed')
        finally:
            self.close_connection = True
            with self.server.connections_lock:
                self.server.connections.discard(self.connection)
                if upstream: self.server.connections.discard(upstream)
            if upstream: upstream.close()

    def do_CONNECT(self):
        parsed = urlsplit('//'+self.path)
        if not parsed.hostname or not parsed.port:
            self.send_error(400); return
        self.tunnel(parsed.hostname, parsed.port)

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.scheme != 'http' or not parsed.hostname:
            self.send_error(400); return
        path = (parsed.path or '/')+('?' + parsed.query if parsed.query else '')
        headers = ''.join(f'{key}: {value}\r\n' for key, value in self.headers.items()
                          if key.lower() not in ('proxy-authorization', 'proxy-connection', 'connection'))
        initial = f'{self.command} {path} HTTP/1.1\r\n{headers}Connection: close\r\n\r\n'.encode('latin-1')
        self.tunnel(parsed.hostname, parsed.port or 80, initial)

    do_POST = do_PUT = do_DELETE = do_HEAD = do_OPTIONS = do_PATCH = do_GET


class ProxyRelay(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, proxy_url):
        if proxy_url: validate_proxy(proxy_url)
        self.proxy_url = proxy_url
        self.connections = set()
        self.observed_hosts = set()
        self.connections_lock = threading.RLock()
        self.stopping = False
        self.released = False
        super().__init__(('127.0.0.1', 0), RelayHandler)
        threading.Thread(target=self.serve_forever, daemon=True).start()

    def close(self):
        self.stopping = True
        with self.connections_lock:
            for connection in self.connections:
                try: connection.shutdown(socket.SHUT_RDWR)
                except OSError: pass
                connection.close()
            self.connections.clear()
        self.shutdown()
        self.server_close()
