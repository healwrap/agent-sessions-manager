"""Read the current login identity through an already running, owned Claude browser."""
from urllib.parse import urlsplit
from .web_session import WebSession


def inspect_login(runtime, account_id):
    settings = runtime.environments.read()
    account = next((row for row in settings['accounts'] if row['id'] == account_id), None)
    if not account or account['provider'] != 'claude':
        raise ValueError('请选择已有的 Claude 账号')
    key = account['profile_id']
    with runtime.lock:
        run = runtime.runs.get(key, {})
        process, control = runtime.processes.get(key), runtime.controls.get(key)
        if (not process or process.poll() is not None or not control
                or run.get('status') != 'running' or run.get('account_id') != account_id):
            raise ValueError('请先从此账号打开绑定的浏览器，并等待启动检查通过')
    targets = control.command('Target.getTargets')['targetInfos']
    candidates = []
    for target in targets:
        parsed = urlsplit(target.get('url', ''))
        if (target.get('type') == 'page' and parsed.scheme == 'https'
                and parsed.hostname == 'claude.ai' and parsed.port in (None, 443)):
            candidates.append(target['targetId'])
    if not candidates:
        return {'state': 'pending', 'message': '请在这个账号的专用浏览器中打开 Claude 并完成登录'}
    session = WebSession(control)
    last = {}
    for target in candidates[:3]:
        with runtime.lock:
            if (runtime.controls.get(key) is not control or process.poll() is not None
                    or runtime.runs.get(key, {}).get('status') != 'running'):
                raise ValueError('浏览器状态已改变，请重新打开后检查')
        last = session.identity(target)
        email = last.get('email')
        if not email:
            continue
        expected = account['name'].strip()
        matches = email.casefold() == expected.casefold() if '@' in expected else None
        return {'state': 'mismatch' if matches is False else 'verified',
                'email': email, 'matches': matches,
                'message': ('实际登录邮箱为 '+email+'，与账号邮箱 '+expected+' 不一致'
                            if matches is False else '已确认当前登录邮箱：'+email)}
    return {'state': 'pending',
            'message': ('请先在浏览器中完成网站验证' if last.get('challenge') else
                        '当前登录凭据无效，请重新通过邮箱登录' if last.get('rejected') else
                        '尚未取得登录身份，请完成登录后重试')}
