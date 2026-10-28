"""Generate only loopback proxy listeners and explicit destination routes."""
import json
import re

DEFAULT_DIRECT = ['sankuai.com', 'meituan.com', 'meituan.net']
CLAUDE_DOMAINS = ['claude.ai', 'claude.com', 'anthropic.com', 'claudeusercontent.com',
                 'claudemcpcontent.com', 'claude.site', 'datadoghq.com', 'sentry.io',
                 'intercom.io', 'intercomcdn.com', 'hcaptcha.com']
PRIVATE_NETWORKS = ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16',
                    '169.254.0.0/16', '::1/128', 'fc00::/7', 'fe80::/10']
NODE_TYPES = {'http', 'socks5', 'ss', 'ssr', 'vmess', 'vless', 'trojan', 'hysteria',
              'hysteria2', 'tuic', 'anytls', 'snell', 'mieru'}


def direct_domains(value):
    if not isinstance(value, list) or len(value) > 100:
        raise ValueError('直连域名最多填写 100 个')
    result = []
    for domain in value:
        if not isinstance(domain, str): raise ValueError('直连域名格式无效')
        domain = domain.strip().lower().strip('.')
        if not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*', domain):
            raise ValueError('请填写域名，例如 sankuai.com，不含协议、路径或通配符')
        if any(domain == host or host.endswith('.'+domain) or domain.endswith('.'+host) for host in CLAUDE_DOMAINS):
            raise ValueError('Claude 服务域名固定使用专用代理，不能加入直连')
        if domain not in result: result.append(domain)
    return result


def node_config(value):
    if not isinstance(value, dict) or value.get('type') not in NODE_TYPES:
        raise ValueError('请选择受支持的 Clash 代理节点')
    budget = [0]
    def bounded(row, depth=0):
        budget[0] += 1
        if depth > 20 or budget[0] > 5000: raise ValueError('节点配置嵌套过深或引用过多')
        if isinstance(row, dict):
            for field, child in row.items():
                if not isinstance(field, str): raise ValueError('节点配置字段名应为文本')
                bounded(child, depth+1)
        elif isinstance(row, list):
            for child in row: bounded(child, depth+1)
    bounded(value)
    try: value = json.loads(json.dumps(value, ensure_ascii=False))
    except (ValueError, TypeError, RecursionError): raise ValueError('节点配置不能包含递归引用或非 JSON 数据') from None
    if len(json.dumps(value)) > 65536: raise ValueError('节点配置过大')
    if not isinstance(value.get('server'), str) or not value['server'].strip(): raise ValueError('节点缺少服务器地址')
    if type(value.get('port')) is not int or not 1 <= value['port'] <= 65535: raise ValueError('节点端口无效')
    if any(key in value for key in ('dialer-proxy', 'interface-name', 'routing-mark')):
        raise ValueError('此节点依赖其他代理或网卡，请导入可独立连接的节点')
    return {**value, 'name': 'ACCOUNT', 'udp': False}


def configuration(entry):
    rules = [f'DOMAIN-SUFFIX,{host},ACCOUNT' for host in CLAUDE_DOMAINS]
    rules += [f'DOMAIN-SUFFIX,{host},DIRECT' for host in ['localhost', 'local']+entry['direct_domains']]
    rules += [f'{"IP-CIDR6" if ":" in network else "IP-CIDR"},{network},DIRECT,no-resolve' for network in PRIVATE_NETWORKS]
    rules += ['MATCH,ACCOUNT']
    return {'allow-lan': False, 'mode': 'rule', 'log-level': 'info', 'ipv6': False,
            'tun': {'enable': False}, 'profile': {'store-selected': False, 'store-fake-ip': False},
            'dns': {'enable': True, 'enhanced-mode': 'redir-host', 'nameserver': ['system'],
                    'direct-nameserver': ['system'], 'proxy-server-nameserver': ['system']},
            'listeners': [{'name': 'account-entry', 'type': 'mixed', 'listen': '127.0.0.1',
                           'port': entry['port'], 'udp': False}],
            'proxies': [node_config(entry['node'])], 'rules': rules}
