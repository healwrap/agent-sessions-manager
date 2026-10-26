"""Read local network and Claude configuration without modifying application state."""
import json
import os
import plistlib
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit


def item(key, title, state, value, detail, scope='本机'):
    return {'id': key, 'title': title, 'state': state, 'value': value, 'detail': detail, 'scope': scope}


def command(*args):
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=3).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return ''


def settings_summary(path):
    if not path.is_file(): return '未找到设置文件'
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        env = data.get('env', {})
        if not isinstance(env, dict): return 'env 设置格式无效'
        values = []
        for key in ('CLAUDE_CODE_EFFORT_LEVEL', 'MAX_THINKING_TOKENS', 'CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING'):
            if key in env: values.append(f'{key}={env[key]}')
        for key in ('effortLevel', 'maxEffortLevel', 'model', 'alwaysThinkingEnabled'):
            if key in data: values.append(f'{key}={data[key]}')
        base = env.get('ANTHROPIC_BASE_URL')
        if isinstance(base, str):
            endpoint = urlsplit(base)
            values.append(f'API 主机：{endpoint.hostname or "地址格式无效"}')
        return '；'.join(values) or '未设置模型、思考强度或 API 地址覆盖'
    except (OSError, ValueError, AttributeError):
        return '设置文件无法读取或格式无效'


def inspect_local(claude_home):
    rows = [item('cli-settings', 'Claude Code 用户设置', 'info', settings_summary(claude_home/'settings.json'),
                 str(claude_home/'settings.json'), '配置文件参考')]
    if sys.platform != 'darwin':
        rows.append(item('system-network', '系统代理与 DNS', 'unknown', '当前平台暂未读取',
                         '网络检测仍可使用系统路由或指定代理。'))
        return rows
    proxy = command('/usr/sbin/scutil', '--proxy')
    enabled = [name for name in ('HTTP', 'HTTPS', 'SOCKS')
               if re.search(rf'\b{name}Enable\s*:\s*1\b', proxy)]
    pac = bool(re.search(r'ProxyAutoConfigEnable\s*:\s*1\b', proxy))
    rows.append(item('system-proxy', '系统代理', 'info',
                     '、'.join(enabled + (['PAC'] if pac else [])) or ('未开启' if proxy else '未取得配置'),
                     '“系统路由”检测不读取系统 HTTP / PAC 代理；仍遵循操作系统的 VPN / TUN 路由。'))
    dns = command('/usr/sbin/scutil', '--dns')
    servers = list(dict.fromkeys(re.findall(r'nameserver\[\d+\]\s*:\s*(\S+)', dns)))
    rows.append(item('dns-config', '本机 DNS 解析器', 'info' if servers else 'unknown',
                     '、'.join(servers) or '未取得解析器地址', '这是本机配置，不等同于 DNS 公网出口或泄漏检测。'))
    timezone = Path('/etc/localtime')
    try: zone = str(timezone.resolve()).split('zoneinfo/')[-1]
    except OSError: zone = ''
    rows.append(item('system-timezone', '电脑时区', 'info', zone or '未取得',
                     '仅展示电脑设置；目标 Claude / 浏览器的时区需要在对应环境验证。'))
    bundle = Path('/Applications/Claude.app')
    version = ''
    try:
        with (bundle/'Contents/Info.plist').open('rb') as handle:
            version = plistlib.load(handle).get('CFBundleShortVersionString', '')
    except (OSError, ValueError, plistlib.InvalidFileException): pass
    rows.append(item('desktop-install', 'Claude App', 'info' if bundle.exists() else 'unknown',
                     f'已安装 {version}' if bundle.exists() else '未在 /Applications 找到',
                     '安装状态与版本；本次不会启动或退出 Claude。'))
    pids = command('/usr/bin/pgrep', '-x', 'Claude').split()
    if not pids:
        rows.append(item('desktop-config', 'Claude App 运行配置', 'unknown', '未检测到运行中的 App',
                         '启动后的进程环境才能确认配置目录和继承的思考强度。'))
        return rows
    for pid in pids[:2]:
        if not pid.isdigit(): continue
        process = command('/bin/ps', 'eww', '-p', pid, '-o', 'command=')
        if '/Claude.app/Contents/MacOS/Claude' not in process: continue
        config = re.search(r'(?:^| )CLAUDE_CONFIG_DIR=(.*?)(?= [A-Za-z_][A-Za-z0-9_]*=|$)', process)
        effort = re.search(r'(?:^| )CLAUDE_CODE_EFFORT_LEVEL=([^ ]*)', process)
        directory = Path(config[1].strip()).expanduser() if config else Path.home()/'.claude'
        shared = directory.resolve() in {claude_home.resolve(), (Path.home()/'.claude').resolve()}
        rows.append(item('desktop-config', 'Claude App 的 Code 配置', 'warn' if shared else 'pass',
                         '与命令行共用目录' if shared else '使用独立目录', str(directory), 'Claude App 进程'))
        rows.append(item('desktop-effort', 'App 继承的思考强度', 'info', effort[1] if effort else '未继承该环境变量',
                         settings_summary(directory/'settings.json'), 'Claude App 进程与用户设置'))
        break
    return rows
