"""Read only the selected App environment's Code OAuth login."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
import unicodedata
from .models import UsageError


def read(config):
    config = Path(config)
    if not config.is_dir():
        raise UsageError('requires_browser', '打开此账号的独立浏览器并登录后，即可查询用量')
    value = None
    if sys.platform == 'darwin':
        digest = hashlib.sha256(unicodedata.normalize('NFC', str(config)).encode()).hexdigest()[:8]
        try:
            result = subprocess.run(['security', 'find-generic-password', '-s', 'Claude Code-credentials-'+digest, '-w'],
                                    capture_output=True, text=True, timeout=6)
        except subprocess.TimeoutExpired:
            raise UsageError('login_required', '请完成此环境的钥匙串访问，再刷新用量') from None
        if result.returncode == 0:
            try: value = json.loads(result.stdout)
            except ValueError: raise UsageError('login_required', '此环境的 Code 登录凭据格式无效') from None
        elif result.returncode != 44:
            raise UsageError('login_required', '未能读取此环境的钥匙串登录凭据，请打开账号浏览器查询')
    path = config/'.credentials.json'
    if value is None and path.is_file():
        if path.stat().st_size > 131072: raise UsageError('login_required', '此环境的 Code 凭据文件过大')
        try: value = json.loads(path.read_text(encoding='utf-8'))
        except (ValueError, OSError): raise UsageError('login_required', '此环境的 Code 登录凭据暂不可读') from None
    oauth = value.get('claudeAiOauth') if isinstance(value, dict) else None
    if not isinstance(oauth, dict) or not isinstance(oauth.get('accessToken'), str) or not oauth['accessToken']:
        raise UsageError('requires_browser', '打开此账号的独立浏览器并登录后，即可查询用量')
    expires = oauth.get('expiresAt')
    if type(expires) in (int, float) and expires <= time.time()*1000:
        raise UsageError('login_required', '此环境的 Code 登录已过期，请在环境内更新登录，或打开账号浏览器查询')
    return oauth['accessToken']
