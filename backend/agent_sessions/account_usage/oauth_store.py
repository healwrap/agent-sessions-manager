"""Account-owned credentials, atomically stored with owner-only permissions."""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import time
from .models import UsageError


class OAuthStore:
    def __init__(self, directory):
        self.directory = Path(directory)/'usage-oauth'

    def path(self, key):
        return self.directory/(hashlib.sha256(key.encode()).hexdigest()+'.json')

    def read(self, key):
        path = self.path(key)
        if not path.exists(): return None
        try:
            if path.stat().st_size > 131072: raise ValueError('授权记录过大')
            value = json.loads(path.read_text())
            if (not isinstance(value, dict) or value.get('account_id') != key
                    or not isinstance(value.get('access_token'), str) or not value['access_token']
                    or not isinstance(value.get('email'), str) or '@' not in value['email']
                    or type(value.get('expires_at')) not in (int, float) or not value['expires_at'] > 0):
                raise ValueError('授权记录不完整')
            return value
        except (ValueError, OSError):
            raise UsageError('login_required', '后台查询授权暂不可读，请重新授权') from None

    def write(self, key, value):
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.directory.chmod(0o700)
        path = self.path(key)
        temporary = path.with_suffix('.tmp')
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, 'w') as stream:
            json.dump({**value, 'account_id': key}, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(0o600)
        temporary.replace(path)

    @contextmanager
    def claim(self, key):
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        path = self.path(key).with_suffix('.lock')
        with open(path, 'a+b') as stream:
            path.chmod(0o600)
            if os.name == 'nt':
                import msvcrt
                stream.seek(0)
                if not stream.read(1): stream.write(b'0'); stream.flush()
            else:
                import fcntl
            deadline = time.monotonic()+15
            while True:
                try:
                    if os.name == 'nt':
                        stream.seek(0); msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                    else: fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise UsageError('error', '此账号的后台授权正在更新，请稍后刷新') from None
                    time.sleep(.05)
            try: yield
            finally:
                if os.name == 'nt':
                    stream.seek(0); msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
                else: fcntl.flock(stream, fcntl.LOCK_UN)
