"""Validate explicit direct destinations while retaining Claude proxy routing."""
import re

CLAUDE_DOMAINS = ('claude.ai', 'claude.com', 'anthropic.com', 'claudeusercontent.com',
                  'anthropicusercontent.com', 'claudemcpcontent.com', 'clau.de', 'claude.site')


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
