"""Parse user-selected Clash subscriptions without applying their global settings."""
import json
import threading
import time
import urllib.request
from urllib.parse import urlsplit
from uuid import uuid4
import yaml
from .config import NODE_TYPES, node_config

MAX_SOURCE = 1_000_000


def subscription_url(source):
    source = source.strip() if isinstance(source, str) else ''
    return source if '\n' not in source and source.startswith(('https://', 'http://')) else ''


def parse_nodes(source):
    if not isinstance(source, str) or not source.strip() or len(source.encode()) > MAX_SOURCE:
        raise ValueError('请粘贴订阅链接或不超过 1 MB 的 Clash 配置')
    source = source.strip()
    if subscription_url(source):
        parsed = urlsplit(source)
        if not parsed.hostname or parsed.username or parsed.password: raise ValueError('订阅链接格式无效')
        request = urllib.request.Request(source, headers={'User-Agent': 'clash.meta/Agent-Sessions', 'Accept': 'application/yaml, text/yaml, text/plain, */*'})
        try:
            with urllib.request.urlopen(request, timeout=20) as response: data = response.read(MAX_SOURCE+1)
        except OSError as error: raise ValueError('无法读取订阅：'+str(error)) from None
        if len(data) > MAX_SOURCE: raise ValueError('订阅配置超过 1 MB')
        source = data.decode('utf-8-sig')
    try: parsed = yaml.safe_load(source)
    except (yaml.YAMLError, RecursionError): raise ValueError('配置无法解析，请使用 Clash / Mihomo 的 YAML 或 JSON 节点配置') from None
    nodes = parsed.get('proxies', [parsed] if parsed.get('type') else []) if isinstance(parsed, dict) else parsed
    if not isinstance(nodes, list) or not nodes: raise ValueError('没有找到代理节点，请使用包含 proxies 的 Clash 订阅或配置')
    if len(nodes) > 2000: raise ValueError('单次最多导入 2000 个节点')
    result = []
    for index, node in enumerate(nodes):
        if not isinstance(node, dict) or node.get('type') not in NODE_TYPES: continue
        try:
            # Preserve the source name; the managed runtime assigns its own stable outbound name.
            normalized = node_config(node)
            result.append({**normalized, 'name': str(node.get('name') or '节点 '+str(index+1))})
        except ValueError: continue
    if not result: raise ValueError('未找到可独立连接的节点；代理组、链式代理和自定义脚本不会导入')
    return result


class NodeImports:
    def __init__(self):
        self.lock, self.sources = threading.RLock(), {}

    def parse(self, value):
        if not isinstance(value, dict) or set(value) != {'source'}: raise ValueError('请选择订阅或配置来源')
        nodes = parse_nodes(value['source'])
        with self.lock:
            self.sources = {key: row for key, row in self.sources.items() if time.monotonic()-row['created'] < 900}
            if len(self.sources) >= 10: raise ValueError('待创建配置过多，请完成现有导入或稍后重试')
            key = str(uuid4())
            self.sources[key] = {'created': time.monotonic(), 'nodes': nodes, 'url': subscription_url(value['source'])}
        return {'token': key, 'subscription_url': subscription_url(value['source']), 'nodes': [{'index': index, 'name': row['name'], 'type': row['type'], 'server': row['server']}
                                      for index, row in enumerate(nodes)]}

    def select(self, token, index):
        with self.lock:
            row = self.sources.get(token)
            if not row or time.monotonic()-row['created'] >= 900: raise ValueError('导入已过期，请重新解析配置')
            if type(index) is not int or not 0 <= index < len(row['nodes']): raise ValueError('请选择节点')
            return json.loads(json.dumps(row['nodes'][index]))

    def url(self, token):
        with self.lock:
            row = self.sources.get(token)
            if not row or time.monotonic()-row['created'] >= 900: raise ValueError('导入已过期，请重新解析配置')
            return row['url']
