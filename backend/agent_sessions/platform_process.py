"""Native process ownership and Windows helpers shared by managed components."""
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from functools import lru_cache
import psutil


def background_options():
    return {'creationflags': subprocess.CREATE_NO_WINDOW} if sys.platform == 'win32' else {}


def powershell(script, *, timeout=30):
    encoded = base64.b64encode(('$ErrorActionPreference="Stop"; [Console]::OutputEncoding=[Text.UTF8Encoding]::new(); '+script).encode('utf-16-le')).decode()
    result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
                            capture_output=True, text=True, encoding='utf-8-sig', errors='replace', timeout=timeout,
                            **background_options())
    if result.returncode: raise ValueError(result.stderr.strip() or 'Windows 系统操作未完成')
    return result.stdout.strip()


def ps_literal(value):
    return "'"+str(value).replace("'", "''")+"'"


def command_line(pid):
    try: return psutil.Process(pid).cmdline() if type(pid) is int and pid > 1 else []
    except (psutil.Error, OSError): return []


def executable(pid):
    try: return psutil.Process(pid).exe()
    except (psutil.Error, OSError): return ''


def same_path(left, right):
    return bool(left and right and os.path.normcase(str(Path(left).resolve())) == os.path.normcase(str(Path(right).resolve())))


@lru_cache(maxsize=24)
def windows_file_version(path, modified):
    if sys.platform != 'win32': return ''
    import ctypes
    from ctypes import wintypes
    api = ctypes.WinDLL('version', use_last_error=True)
    api.GetFileVersionInfoSizeW.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(wintypes.DWORD)]
    api.GetFileVersionInfoW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p]
    api.VerQueryValueW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR, ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(wintypes.UINT)]
    size = api.GetFileVersionInfoSizeW(path, None)
    if not size: return ''
    buffer = ctypes.create_string_buffer(size)
    if not api.GetFileVersionInfoW(path, 0, size, buffer): return ''
    pointer, length = ctypes.c_void_p(), wintypes.UINT()
    if not api.VerQueryValueW(buffer, '\\', ctypes.byref(pointer), ctypes.byref(length)) or length.value < 52: return ''
    fields = ctypes.cast(pointer, ctypes.POINTER(wintypes.DWORD*13)).contents
    high, low = fields[4], fields[5]
    return '.'.join(str(value) for value in (high >> 16, high & 0xffff, low >> 16, low & 0xffff))


def owns(pid, program, arguments):
    command = command_line(pid)
    return bool(command and same_path(executable(pid) or command[0], program) and command[1:] == list(arguments))


def stop_pid(pid, force=False):
    try:
        process = psutil.Process(pid)
        process.kill() if force else process.terminate()
    except psutil.NoSuchProcess: pass


def claude_processes():
    rows = []
    for process in psutil.process_iter(['pid', 'exe', 'cmdline']):
        value = process.info
        path = (value['exe'] or '').replace('\\', '/')
        if sys.platform == 'darwin' and not path.endswith('/Claude.app/Contents/MacOS/Claude'): continue
        if sys.platform == 'win32' and (Path(path).name.lower() != 'claude.exe' or '/resources/' in path.lower()): continue
        if sys.platform not in ('darwin', 'win32'): continue
        if any(arg.startswith('--type=') for arg in value['cmdline'] or []): continue
        rows.append(value['pid'])
    return rows


def appx_packages(refresh=False):
    if sys.platform != 'win32': return []
    if refresh: _appx_packages.cache_clear()
    return _appx_packages(int(time.monotonic()/5))


@lru_cache(maxsize=2)
def _appx_packages(bucket):
    text = powershell("Get-AppxPackage -Name '*Claude*' | Select-Object Name,PackageFullName,PackageFamilyName,InstallLocation,Version | ConvertTo-Json -Compress")
    value = json.loads(text) if text else []
    return value if isinstance(value, list) else [value]
