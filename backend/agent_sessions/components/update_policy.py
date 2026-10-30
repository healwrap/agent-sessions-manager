"""Read and change Claude Desktop's documented automatic-update policy."""
import json
from pathlib import Path
import plistlib
import shlex
import stat
import subprocess
import sys
import threading

DOMAIN = 'com.anthropic.claudefordesktop'
KEY = 'disableAutoUpdates'
WINDOWS_KEY = r'SOFTWARE\Policies\Claude'


def mac_paths():
    import os
    import pwd
    user = pwd.getpwuid(os.getuid()).pw_name
    root = Path('/Library/Managed Preferences')
    return root/(DOMAIN+'.plist'), root/user/(DOMAIN+'.plist')


def plist_flag(path):
    try:
        with path.open('rb') as stream: value = plistlib.load(stream)
    except FileNotFoundError: return None
    if not isinstance(value, dict): raise ValueError('Claude 系统策略格式无效：'+str(path))
    flag = value.get(KEY)
    if flag is not None and type(flag) is not bool:
        raise ValueError('Claude 自动更新策略必须为布尔值：'+str(path))
    return flag


def registry_flag(hive):
    import winreg
    try:
        with winreg.OpenKey(hive, WINDOWS_KEY, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as key:
            value, kind = winreg.QueryValueEx(key, KEY)
    except FileNotFoundError: return None
    if kind != winreg.REG_DWORD or value not in (0, 1):
        raise ValueError('Claude 自动更新策略必须为 DWORD 0 或 1')
    return bool(value)


class UpdatePolicy:
    def __init__(self):
        self.lock = threading.RLock()

    def _read(self):
        if sys.platform == 'darwin':
            machine_path, user_path = mac_paths()
            machine, user = plist_flag(machine_path), plist_flag(user_path)
            if user is not None: return user, False, '当前用户策略'
        elif sys.platform == 'win32':
            import winreg
            machine = registry_flag(winreg.HKEY_LOCAL_MACHINE)
            user = registry_flag(winreg.HKEY_CURRENT_USER)
        else:
            raise ValueError('当前系统暂不支持 Claude 自动更新设置')
        if machine is not None: return machine, True, '系统策略'
        return bool(user), False, '当前用户策略' if user is not None else '默认设置'

    def state(self):
        supported = sys.platform in ('darwin', 'win32')
        result = {'supported': supported, 'disabled': None, 'locked': False, 'source': '', 'error': ''}
        if not supported: return result
        try:
            disabled, locked, source = self._read()
            result.update(disabled=disabled, locked=locked, source=source)
        except (OSError, ValueError, plistlib.InvalidFileException) as error:
            result['error'] = '无法读取 Claude 自动更新设置：'+str(error)
        return result

    def set_disabled(self, disabled):
        if type(disabled) is not bool: raise ValueError('自动更新设置必须为布尔值')
        with self.lock:
            current, locked, _ = self._read()
            if locked: raise ValueError('Claude 自动更新已由系统策略管理，请联系系统管理员修改')
            if current == disabled: return self.state()
            if sys.platform == 'darwin': self._write_mac(disabled)
            else: self._write_windows(disabled)
            actual, locked, _ = self._read()
            if locked or actual != disabled:
                raise ValueError('Claude 自动更新设置未生效，请重新读取系统策略')
            return self.state()

    def _write_mac(self, disabled):
        _, path = mac_paths()
        if path.is_symlink() or path.parent.is_symlink():
            raise ValueError('Claude 策略目录不能使用符号链接：'+str(path))
        mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o644
        parent = shlex.quote(str(path.parent))
        target = shlex.quote(str(path))
        commands = [
            'set -e',
            f'if [ ! -d {parent} ]; then /usr/bin/install -d -m 0755 {parent}; fi',
            'policy_tmp=$(/usr/bin/mktemp '+shlex.quote(str(path)+'.XXXXXX')+')',
            'trap \'/bin/rm -f "$policy_tmp"\' EXIT',
            f'if [ -f {target} ]; then /bin/cp -p {target} "$policy_tmp"; else /usr/bin/plutil -create xml1 "$policy_tmp"; fi',
            '/usr/bin/plutil -replace '+KEY+' -bool '+('true' if disabled else 'false')+' "$policy_tmp"',
            '/bin/chmod '+format(mode, '04o')+' "$policy_tmp"',
            '/bin/mv -f "$policy_tmp" '+target,
        ]
        script = 'do shell script '+json.dumps('; '.join(commands), ensure_ascii=False)+' with administrator privileges'
        try:
            result = subprocess.run(['/usr/bin/osascript', '-e', script], capture_output=True, text=True, timeout=300)
        except subprocess.TimeoutExpired:
            raise ValueError('管理员授权超时，请重新设置 Claude 自动更新') from None
        if result.returncode:
            raise ValueError(result.stderr.strip() or 'Claude 自动更新设置未完成')

    def _write_windows(self, disabled):
        import winreg
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, WINDOWS_KEY, 0,
                                winreg.KEY_SET_VALUE | winreg.KEY_WOW64_64KEY) as key:
            winreg.SetValueEx(key, KEY, 0, winreg.REG_DWORD, int(disabled))
