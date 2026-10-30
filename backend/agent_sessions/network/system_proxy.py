"""Control the effective OS proxy without changing Verge's saved preferences."""
import ctypes
import sys
import time
import yaml
from .client import verge_directory
from agent_sessions.private_files import private_json

KEY = r'Software\Microsoft\Windows\CurrentVersion\Internet Settings'


def windows_values():
    import winreg
    values = {}
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, KEY) as key:
        for name in ('ProxyEnable', 'ProxyServer', 'ProxyOverride', 'AutoConfigURL'):
            try: values[name] = winreg.QueryValueEx(key, name)
            except FileNotFoundError: pass
    return values


def read():
    supported = sys.platform in ('darwin', 'win32')
    result = {'supported': supported, 'enabled': None, 'error': ''}
    if not supported: return result
    try:
        if sys.platform == 'darwin':
            from . import mac_proxy
            result.update(mac_proxy.read())
        else:
            values = windows_values()
            result.update(enabled=bool(values.get('ProxyEnable', (0,))[0] or values.get('AutoConfigURL', ('',))[0]),
                          server=values.get('ProxyServer', ('',))[0])
    except (OSError, ValueError) as error: result['error'] = str(error)
    path = verge_directory()/'verge.yaml'
    if path.is_file():
        try:
            config = yaml.safe_load(path.read_text(encoding='utf-8')) or {}
            configured = config.get('enable_system_proxy')
            if isinstance(configured, bool): result['clash_configured'] = configured
        except (OSError, ValueError, yaml.YAMLError) as error:
            result['error'] = 'Clash 系统代理设置读取失败：'+str(error)
    return result


def _windows_write(values):
    import winreg
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, KEY) as key:
        for name in ('ProxyEnable', 'ProxyServer', 'ProxyOverride', 'AutoConfigURL'):
            if name in values: winreg.SetValueEx(key, name, 0, values[name][1], values[name][0])
            else:
                try: winreg.DeleteValue(key, name)
                except FileNotFoundError: pass
    wininet = ctypes.WinDLL('wininet', use_last_error=True)
    wininet.InternetSetOptionW.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_void_p, ctypes.c_ulong]
    for option in (39, 37):
        if not wininet.InternetSetOptionW(None, option, None, 0): raise ctypes.WinError(ctypes.get_last_error())


def set_enabled(enabled, port, directory):
    if sys.platform not in ('darwin', 'win32'): raise ValueError('当前系统暂不支持系统代理开关')
    path = verge_directory()/'verge.yaml'
    config = yaml.safe_load(path.read_text(encoding='utf-8')) if path.is_file() else {}
    if config.get('enable_proxy_guard') and bool(config.get('enable_system_proxy')) != enabled:
        raise ValueError('Clash Verge 的系统代理守卫已开启，请先在 Clash 中关闭守卫后再操作')
    if sys.platform == 'darwin':
        from . import mac_proxy
        change, restore = mac_proxy.commands(enabled, port)
        private_json(directory/'system-proxy-backup.json', {'commands': restore})
        try: mac_proxy.execute(change)
        except mac_proxy.AuthorizationDeclined: raise
        except (ValueError, OSError):
            mac_proxy.execute(restore)
            raise
    else:
        import winreg
        original = windows_values()
        private_json(directory/'system-proxy-backup.json', {'values': original})
        changed = {**original, 'ProxyEnable': (int(enabled), winreg.REG_DWORD)}
        changed.pop('AutoConfigURL', None)
        if enabled:
            changed['ProxyServer'] = (f'http=127.0.0.1:{port};https=127.0.0.1:{port}', winreg.REG_SZ)
            changed.setdefault('ProxyOverride', ('<local>;localhost;127.*;[::1]', winreg.REG_SZ))
        try: _windows_write(changed)
        except OSError:
            _windows_write(original)
            raise
    state = read()
    for attempt in range(10):
        if state['enabled'] == enabled: break
        time.sleep(.1)
        state = read()
    if state['error'] or state['enabled'] != enabled:
        raise ValueError(state['error'] or '系统代理实际状态与设置不一致，请检查 Clash 或系统策略')
    return state
