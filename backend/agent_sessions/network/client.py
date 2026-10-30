"""Local Mihomo controller discovery, including Clash Verge's service socket."""
import http.client
import ipaddress
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
from urllib.parse import urlparse
import yaml


def verge_directory():
    if sys.platform == 'darwin':
        return Path.home()/'Library/Application Support/io.github.clash-verge-rev.clash-verge-rev'
    base = Path(os.environ.get('APPDATA', Path.home()/'.config'))
    return base/'io.github.clash-verge-rev.clash-verge-rev'


def source_config():
    path = verge_directory()/'clash-verge.yaml'
    if not path.exists(): raise ValueError('未找到 Clash Verge 配置，请先打开 Clash Verge')
    try: value = yaml.safe_load(path.read_text(encoding='utf-8'))
    except yaml.YAMLError as error: raise ValueError('Clash 配置解析失败：'+str(error)) from None
    if not isinstance(value, dict): raise ValueError('Clash Verge 配置格式无效')
    return value


def local_config():
    """The runtime file has the active secret; config.yaml also exists before first launch."""
    for name in ('clash-verge.yaml', 'config.yaml'):
        path = verge_directory()/name
        if not path.is_file(): continue
        try: value = yaml.safe_load(path.read_text(encoding='utf-8'))
        except yaml.YAMLError as error: raise ValueError('Clash 配置解析失败：'+str(error)) from None
        if isinstance(value, dict): return value
    return {}


class UnixConnection(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__('localhost', timeout=2)
        self.path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.path)


class Controller:
    def __init__(self, settings):
        config = local_config()
        endpoint = settings.get('endpoint', '')
        self.secret = settings.get('secret') or config.get('secret') or ''
        if not isinstance(self.secret, str): raise ValueError('Clash 接口密钥应为文本')
        if endpoint:
            parsed = urlparse(endpoint)
            host = parsed.hostname or ''
            local = host == 'localhost'
            try: local = local or ipaddress.ip_address(host).is_loopback
            except ValueError: pass
            if parsed.scheme != 'http' or not local or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
                raise ValueError('控制接口请填写本机 HTTP 地址，例如 http://127.0.0.1:9097')
            self.endpoint = endpoint.rstrip('/')
            self.connection = lambda: http.client.HTTPConnection(host, parsed.port or 80, timeout=2)
        else:
            pipe = config.get('external-controller-pipe', '') if sys.platform == 'win32' else ''
            if pipe:
                from .windows_pipe import PipeConnection
                # Recent Verge releases use an owner-scoped service pipe instead of the sidecar pipe.
                import re
                owner = re.search(r'verge-mihomo-sidecar-release-([a-f0-9]{64})$', pipe)
                service_pipe = r'\\.\pipe\verge-mihomo-production-'+owner[1] if owner else ''
                if service_pipe:
                    import ctypes
                    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
                    kernel.WaitNamedPipeW.argtypes = [ctypes.c_wchar_p, ctypes.c_ulong]
                    if kernel.WaitNamedPipeW(service_pipe, 1): pipe = service_pipe
                self.endpoint = pipe
                self.connection = lambda: PipeConnection(pipe)
                return
            service = Path(f'/var/run/clash-verge-service/users/{os.getuid()}/verge-mihomo.sock') if sys.platform == 'darwin' else None
            path = str(service) if service and service.exists() else config.get('external-controller-unix', '')
            if not path and sys.platform == 'darwin': path = str(Path(tempfile.gettempdir())/'verge-mihomo.sock')
            if path and hasattr(socket, 'AF_UNIX') and Path(path).exists():
                self.endpoint = path
                self.connection = lambda: UnixConnection(path)
            else:
                address = config.get('external-controller', '')
                if not address: raise ValueError('Clash 控制接口未启用，请在连接设置中填写本机地址')
                other = Controller({'endpoint': 'http://'+address, 'secret': self.secret})
                self.endpoint, self.connection = other.endpoint, other.connection

    def request(self, method, path, value=None):
        connection = self.connection()
        try:
            connection.request(method, path, None if value is None else json.dumps(value),
                               {'Authorization': 'Bearer '+self.secret, 'Content-Type': 'application/json'})
            response = connection.getresponse()
            data = response.read()
            result = json.loads(data) if data else {}
            if response.status >= 400: raise ValueError(result.get('message') or f'Clash 接口返回 {response.status}')
            return result
        except (OSError, http.client.HTTPException) as error:
            raise ValueError('无法连接 Clash Verge：'+str(error)) from None
        finally: connection.close()
