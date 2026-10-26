"""Resolve one environment's route and regional settings before opening its client."""
from .gates import check, policy
from .region import exit_ip, region_for


def inspect(profile, proxy, *, browser=True):
    modes = policy(profile)
    url = proxy['url'] if proxy else ''
    follows = any(profile.get(field+'_mode', 'manual') == 'proxy' for field in ('locale', 'timezone'))
    keys = ('proxy', 'region', 'exit_ip')
    needs_exit = follows or any(modes[field] != 'off' for field in keys)
    exit = exit_ip(url) if needs_exit else {'ip': '', 'error': ''}
    region = region_for(url, exit['ip']) if exit['ip'] and (follows or modes['region'] != 'off') else {}
    resolved = {'ip': exit['ip'], 'country': region.get('country', ''), 'probe_source': exit.get('source', '')}
    for field in ('locale', 'timezone'):
        resolved[field] = region.get(field) if profile.get(field+'_mode') == 'proxy' and region.get(field) else profile[field]
    checks = [check(profile, 'proxy', 'pass' if exit['ip'] else 'fail',
                    '专用代理链路可用' if proxy and exit['ip'] else '系统路由可用' if exit['ip'] else exit['error'] or '未执行网络预检'),
              check(profile, 'region', 'pass' if region and not region.get('error') else 'unknown',
                    f"{region.get('country', '')} · {region.get('timezone', '')}" if region and not region.get('error') else '出口定位未完成',
                    '语言与时区按出口解析；定位失败时使用环境中保存的备用值')]
    if not browser:
        expected = profile.get('expected_ip', '')
        item = check(profile, 'exit_ip', 'unknown' if not exit['ip'] else 'pass' if not expected or expected == exit['ip'] else 'fail', exit['ip'] or '未取得代理预检出口', f"指定 IP：{expected or '未固定'}；此项来自后台代理预检")
        item['title'] = '代理预检出口 IP'
        checks.append(item)
    return resolved, checks
