"""Read known system launch guards that can close independently launched clients."""
from pathlib import Path
import subprocess
import sys
import time

_cached = (0, [])


def warnings():
    global _cached
    if sys.platform != 'darwin': return []
    if time.monotonic() < _cached[0]: return _cached[1]
    found = []
    if Path('/Library/LaunchDaemons/local.claude-bodyguard.plist').is_file():
        result = subprocess.run(['launchctl', 'print', 'system/local.claude-bodyguard'], capture_output=True, timeout=3)
        if result.returncode == 0:
            found.append('检测到旧切换器的 claude-bodyguard 系统守卫；它可能在 TUN 未开启时关闭隔离 Claude App。请先停用该守卫。')
    _cached = (time.monotonic()+10, found)
    return found
