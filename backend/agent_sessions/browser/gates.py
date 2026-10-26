"""User-selected launch policies; only failed or unknown blocking checks stop launch."""
import ipaddress
import re

DEFAULTS = {'proxy': 'block', 'region': 'warn', 'exit_ip': 'block', 'timezone': 'warn',
            'language': 'warn', 'fingerprint': 'warn', 'webrtc': 'warn', 'dns': 'off'}
LABELS = {'proxy': '代理连接', 'region': '出口定位', 'exit_ip': '出口 IP', 'timezone': '时区一致性',
          'language': '语言一致性', 'fingerprint': '指纹稳定性', 'webrtc': 'WebRTC 出口', 'dns': 'DNS 公网出口'}
NOTES = {'proxy': '通过所选代理访问出口探针，失败时保持原代理设置',
         'region': '解析出口位置；语言按地区推荐，时区使用出口定位结果',
         'exit_ip': '浏览器实测出口与指定 IP 或启动预检出口比较',
         'timezone': '目标浏览器实际时区与环境设置比较',
         'language': '目标浏览器实际语言与环境设置比较',
         'fingerprint': '相同指纹种子与上次 Canvas 基线比较',
         'webrtc': '公网 ICE 候选与浏览器 HTTP 出口比较，未取得候选时为未验证',
         'dns': '权威 DNS 探针尚未接入；强制模式将拦截未验证结果'}


def definitions():
    return [{'id': key, 'title': LABELS[key], 'description': NOTES[key], 'default_mode': mode}
            for key, mode in DEFAULTS.items()]


def policy(profile):
    return {**DEFAULTS, **profile.get('gates', {})}


def check(profile, key, state, value, detail=''):
    mode = policy(profile)[key]
    return {'id': key, 'title': LABELS[key], 'policy': mode,
            'state': 'skip' if mode == 'off' else state,
            'value': '已关闭' if mode == 'off' else value, 'detail': detail}


def blocked(checks):
    return any(row['policy'] == 'block' and row['state'] not in ('pass', 'skip') for row in checks)


def browser_checks(profile, resolved, rows, baseline):
    values = {row['id']: row for row in rows}
    browser_ip = values.get('browser-http-ip', {})
    ip = ''
    try: ip = str(ipaddress.ip_address(browser_ip.get('value', '')))
    except ValueError: pass
    expected_ip = profile.get('expected_ip') or resolved.get('ip', '')
    seed = profile['fingerprint_seed']
    canvas = values.get('canvas', {}).get('value', '')
    fingerprint = bool(re.fullmatch(r'[0-9a-f]{64}', canvas))
    old = baseline if baseline and baseline.get('seed') == seed else None
    actual_locale = values.get('window-language', {}).get('value', '')
    actual_zone = values.get('window-timezone', {}).get('value', '')
    public = []
    for candidate in values.get('webrtc', {}).get('value', '').split('；'):
        try:
            address = ipaddress.ip_address(candidate.split(' · ')[-1])
            if address.is_global: public.append(str(address))
        except ValueError: pass
    return [
        check(profile, 'exit_ip', 'unknown' if not ip else 'pass' if not expected_ip or ip == expected_ip else 'fail',
              ip or '未取得浏览器出口', f'期望出口：{expected_ip or "任意可验证出口"}；实际值来自目标浏览器'),
        check(profile, 'timezone', 'pass' if actual_zone == resolved['timezone'] else 'fail', actual_zone,
              f'期望：{resolved["timezone"]}'),
        check(profile, 'language', 'pass' if resolved['locale'].lower() in actual_locale.lower().split('、') else 'fail',
              actual_locale, f'期望：{resolved["locale"]}'),
        check(profile, 'fingerprint', 'unknown' if not fingerprint else 'pass' if not old or old['canvas'] == canvas else 'fail',
              canvas if fingerprint else '未取得 Canvas 指纹', '首次采样建立基线' if not old else '与相同种子的上次基线比较'),
        check(profile, 'webrtc', 'unknown' if not public or not ip else 'pass' if set(public) == {ip} else 'fail',
              '、'.join(public) or '未取得公网候选，尚未验证', '公网 ICE 地址与此浏览器 HTTP 出口比较'),
        check(profile, 'dns', 'unknown', '尚未接入权威 DNS 探针', '强制模式会在未验证时拦截'),
    ], {'seed': seed, 'canvas': canvas} if fingerprint and (not old or old['canvas'] == canvas) else None
