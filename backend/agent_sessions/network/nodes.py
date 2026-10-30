"""Application-owned single Claude nodes, independent of the selected subscription."""
import copy
import ipaddress
import json
import re
from urllib.parse import unquote
import yaml
from agent_sessions.browser.proxy import validate_proxy

PREFIX = 'agent-sessions-node-'


def validate(node):
    if not isinstance(node, dict) or not isinstance(node.get('type'), str):
        raise ValueError('请填写一个完整代理节点，不接受订阅或策略组')
    if any(key in node for key in ('proxies', 'proxy-providers', 'proxy-groups', 'rules')):
        raise ValueError('请只粘贴一个节点，不要粘贴整份订阅')
    if node.get('dialer-proxy') not in (None, '', 'DIRECT'):
        raise ValueError('此节点依赖其他代理，请提供可独立连接的单个节点')
    host = node.get('server')
    if not isinstance(host, str) or not host or len(host) > 253 or any(c.isspace() or ord(c) < 32 for c in host):
        raise ValueError('节点服务器地址无效')
    try: ipaddress.ip_address(host)
    except ValueError:
        if not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?', host): raise ValueError('节点服务器地址无效') from None
    if type(node.get('port')) is not int or not 1 <= node['port'] <= 65535: raise ValueError('节点端口应为 1–65535')
    if node['type'].lower() in ('direct', 'reject', 'pass', 'selector', 'select', 'url-test', 'fallback', 'load-balance', 'relay'):
        raise ValueError('请选择具体代理节点，不能使用直连或自动策略组')
    try:
        if len(json.dumps(node, allow_nan=False)) > 32768: raise ValueError('单个节点配置过长')
    except (TypeError, OverflowError): raise ValueError('节点配置应只包含文本、数字、布尔值和列表') from None
    return copy.deepcopy(node)


def parse(value, key):
    supplied = [field for field in ('address', 'node_yaml', 'node') if value.get(field)]
    if len(supplied) != 1: raise ValueError('请填写代理地址或单节点配置，二选一')
    field = supplied[0]
    if field == 'address':
        if not isinstance(value[field], str): raise ValueError('代理地址格式无效')
        parsed = validate_proxy(value[field].strip())
        if parsed.scheme not in ('http', 'https', 'socks5', 'socks5h'): raise ValueError('支持 HTTP、HTTPS 和 SOCKS5 节点')
        node = {'type': 'socks5' if parsed.scheme.startswith('socks5') else 'http', 'server': parsed.hostname, 'port': parsed.port}
        if parsed.scheme == 'https': node['tls'] = True
        if parsed.username is not None: node['username'] = unquote(parsed.username)
        if parsed.password is not None: node['password'] = unquote(parsed.password)
    elif field == 'node_yaml':
        if not isinstance(value[field], str) or len(value[field]) > 32768: raise ValueError('单节点配置无效或过长')
        try: node = yaml.safe_load(value[field])
        except yaml.YAMLError: raise ValueError('单节点 YAML 格式无效') from None
        if isinstance(node, list) and len(node) == 1: node = node[0]
    else: node = value[field]
    node = validate(node)
    node['type'] = node['type'].lower()
    node['name'] = PREFIX+key
    return node


def import_existing(proxy, source):
    if proxy.get('node'): return proxy
    node = next((row for row in source.get('proxies', []) if row.get('name') == proxy['clash_node']), None)
    if not node: raise ValueError('无法导入原节点“'+proxy['name']+'”，请在配置中填写单节点地址')
    node = validate(node)
    node['name'] = PREFIX+proxy['id']
    return {**proxy, 'node': node, 'clash_node': node['name']}
