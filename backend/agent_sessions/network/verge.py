"""Discover and start the installed Clash Verge without assuming another user's path."""
import os
from pathlib import Path
import subprocess
import sys
import psutil


def executable():
    for process in psutil.process_iter(['name', 'exe']):
        if (process.info['name'] or '').lower() in ('clash-verge.exe', 'clash verge.exe', 'clash-verge'):
            if process.info['exe']: return Path(process.info['exe'])
    if sys.platform == 'darwin':
        return next((path/'Contents/MacOS/clash-verge' for path in
                     (Path('/Applications/Clash Verge.app'), Path.home()/'Applications/Clash Verge.app')
                     if path.is_dir()), None)
    if sys.platform != 'win32': return None
    import winreg
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        for key in (r'Software\Microsoft\Windows\CurrentVersion\Uninstall',
                    r'Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'):
            try:
                with winreg.OpenKey(hive, key) as root:
                    for index in range(winreg.QueryInfoKey(root)[0]):
                        with winreg.OpenKey(root, winreg.EnumKey(root, index)) as item:
                            try:
                                if 'clash verge' not in str(winreg.QueryValueEx(item, 'DisplayName')[0]).lower(): continue
                                directory = Path(winreg.QueryValueEx(item, 'InstallLocation')[0])
                                for name in ('clash-verge.exe', 'Clash Verge.exe'):
                                    if (directory/name).is_file(): return directory/name
                            except FileNotFoundError: pass
            except FileNotFoundError: pass
    for key in ('LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)'):
        base = Path(os.environ.get(key, ''))
        for directory in ('Clash Verge', 'Programs/Clash Verge', 'clash-verge'):
            for name in ('clash-verge.exe', 'Clash Verge.exe'):
                if (base/directory/name).is_file(): return base/directory/name
    return None


def open_app():
    path = executable()
    if not path: raise ValueError('未找到 Clash Verge，请先安装后再启动账号')
    if sys.platform == 'darwin': subprocess.Popen(['open', '-a', str(path.parents[2])])
    elif sys.platform == 'win32': os.startfile(str(path))
    else: raise ValueError('当前系统暂不支持自动启动 Clash Verge')
