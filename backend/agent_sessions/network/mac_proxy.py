"""Read effective macOS proxy settings and change the active network service."""
import json
import re
import shlex
import subprocess


class AuthorizationDeclined(ValueError): pass


def _run(args, **kwargs):
    result = subprocess.run(args, text=True, capture_output=True, timeout=10, **kwargs)
    if result.returncode: raise ValueError(result.stderr.strip() or result.stdout.strip())
    return result.stdout


def _dictionary(key):
    output = _run(['/usr/sbin/scutil'], input='show '+key+'\nquit\n')
    return dict(re.findall(r'^  ([A-Za-z][A-Za-z0-9]*)[ \t]+:[ \t]*([^\r\n]*?)\s*$', output, re.M))


def read():
    value = _dictionary('State:/Network/Global/Proxies')
    enabled = any(value.get(key) == '1' for key in
                  ('HTTPEnable', 'HTTPSEnable', 'SOCKSEnable', 'ProxyAutoConfigEnable', 'ProxyAutoDiscoveryEnable'))
    return {'enabled': enabled, 'server': value.get('HTTPProxy', ''), 'port': value.get('HTTPPort', '')}


def commands(enabled, port):
    primary = _dictionary('State:/Network/Global/IPv4').get('PrimaryService')
    if not primary: primary = _dictionary('State:/Network/Global/IPv6').get('PrimaryService')
    service = _dictionary('Setup:/Network/Service/'+primary).get('UserDefinedName') if primary else None
    if not service: raise ValueError('未找到当前网络服务，请先连接网络')
    change = []
    restore = []
    for protocol in ('web', 'secureweb', 'socksfirewall'):
        info = dict(line.split(': ', 1) for line in _run(['/usr/sbin/networksetup', '-get'+protocol+'proxy', service]).splitlines() if ': ' in line)
        if enabled and protocol in ('web', 'secureweb'):
            change.append(['/usr/sbin/networksetup', '-set'+protocol+'proxy', service, '127.0.0.1', str(port)])
        change.append(['/usr/sbin/networksetup', '-set'+protocol+'proxystate', service,
                       'on' if enabled and protocol in ('web', 'secureweb') else 'off'])
        if enabled and protocol in ('web', 'secureweb') and info.get('Server'):
            restore.append(['/usr/sbin/networksetup', '-set'+protocol+'proxy', service, info['Server'], info.get('Port', '0')])
        restore.append(['/usr/sbin/networksetup', '-set'+protocol+'proxystate', service, 'on' if info.get('Enabled') == 'Yes' else 'off'])
    for option in ('autoproxy', 'proxyautodiscovery'):
        output = _run(['/usr/sbin/networksetup', '-get'+('autoproxyurl' if option == 'autoproxy' else option), service])
        flag = 'Enabled: Yes' in output or output.strip().endswith(': On')
        setter = '-setautoproxystate' if option == 'autoproxy' else '-setproxyautodiscovery'
        change.append(['/usr/sbin/networksetup', setter, service, 'off'])
        restore.append(['/usr/sbin/networksetup', setter, service, 'on' if flag else 'off'])
    return change, restore


def execute(commands):
    script = 'set -e\n'+'\n'.join(shlex.join(row) for row in commands)
    result = subprocess.run(['/bin/sh', '-c', script], capture_output=True, text=True, timeout=15)
    output = result.stdout+'\n'+result.stderr
    if not result.returncode: return
    if not any(word in output.lower() for word in ('administrator', 'root', 'permission', 'authorization')):
        raise ValueError(output.strip() or '系统代理设置失败')
    apple = 'do shell script '+json.dumps(script, ensure_ascii=False)+' with administrator privileges'
    try:
        result = subprocess.run(['/usr/bin/osascript', '-e', apple], capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        raise ValueError('系统代理授权超时，请重新设置') from None
    if result.returncode:
        if '-128' in result.stderr: raise AuthorizationDeclined('已取消系统代理授权')
        raise ValueError(result.stderr.strip() or '系统代理设置未完成')
