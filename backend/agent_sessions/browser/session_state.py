"""Check local session presence without copying or exposing authentication values."""
from pathlib import Path
import sqlite3
import time

NAMES = ('sessionKey', 'sessionKeyV2', 'sessionKeyV3')


def session_state(directory, provider='claude'):
    directory = Path(directory)
    candidates = [directory/'Cookies', directory/'Network/Cookies',
                  directory/'Default/Cookies', directory/'Default/Network/Cookies']
    found = False
    for path in candidates:
        if not path.is_file(): continue
        found = True
        try:
            with sqlite3.connect(path.as_uri()+'?mode=ro', uri=True, timeout=.05) as connection:
                rows = connection.execute('SELECT host_key, name, expires_utc, has_expires, length(value)+length(encrypted_value) FROM cookies').fetchall()
            now = (time.time()+11644473600)*1000000
            for host, name, expires, expiring, size in rows:
                matches = (host.lstrip('.') == 'claude.ai' or host.endswith('.claude.ai')) and name in NAMES if provider == 'claude' else (
                    any(host.lstrip('.') == domain or host.endswith('.'+domain) for domain in ('chatgpt.com', 'openai.com')) and 'session-token' in name)
                if matches and size and (not expiring or expires > now):
                    return {'state': 'saved', 'label': '已保存登录状态'}
        except sqlite3.Error:
            return {'state': 'unavailable', 'label': '登录状态待读取'}
    return {'state': 'empty', 'label': '尚未检测到登录状态' if found else '首次使用请登录'}
