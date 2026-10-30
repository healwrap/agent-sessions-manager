"""Persist only an owned fragment in Clash Verge's global extension script."""
import copy
import hashlib
import json
from pathlib import Path
import re
import time
from .client import verge_directory, source_config
from agent_sessions.proxy_service.process import private_json

START = '// BEGIN AGENT SESSIONS NETWORK'
END = '// END AGENT SESSIONS NETWORK'
GROUP = 'Agent Sessions · Claude'
CLAUDE_DOMAINS = ('claude.ai', 'claude.com', 'anthropic.com', 'claudeusercontent.com',
                  'anthropicusercontent.com', 'clau.de', 'claude.site')


def rules(settings):
    group = settings['group']
    company = ([f'IP-CIDR,{address}/32,DIRECT,no-resolve' if ':' not in address else
             f'IP-CIDR6,{address}/128,DIRECT,no-resolve' for address in settings['dns']]
            + [f'DOMAIN-SUFFIX,{domain},DIRECT' for domain in settings['domains']])
    if not group: return company
    return (company + [rf'PROCESS-PATH-REGEX,(?i).*[/\\]Claude\.app[/\\]Contents[/\\].*,{group}',
               rf'PROCESS-NAME-REGEX,(?i)^claude( helper.*|\.exe)?$,{group}']
            + [f'DOMAIN-SUFFIX,{domain},{group}' for domain in CLAUDE_DOMAINS])


def configured(config, settings, lines=()):
    result = copy.deepcopy(config)
    result['find-process-mode'] = 'strict'
    added = rules(settings)
    result['rules'] = added+[row for row in result.get('rules', []) if row not in added]
    result['proxy-groups'] = [row for row in result.get('proxy-groups', []) if row.get('name') != GROUP]
    result['listeners'] = [row for row in result.get('listeners', []) if not row.get('name', '').startswith('agent-sessions-')]
    result['sub-rules'] = {key: value for key, value in result.get('sub-rules', {}).items() if not key.startswith('agent-sessions-')}
    if lines:
        inline = list(dict.fromkeys(['REJECT']+[line['clash_node'] for line in lines]))
        existing = [row for row in result.get('proxy-groups', []) if row.get('name') != GROUP]
        result['proxy-groups'] = existing+[{'name': GROUP, 'type': 'select', 'proxies': inline}]
        listeners = [row for row in result.get('listeners', []) if not row.get('name', '').startswith('agent-sessions-')]
        subrules = {key: value for key, value in result.get('sub-rules', {}).items() if not key.startswith('agent-sessions-')}
        for line in lines:
            name = 'agent-sessions-'+line['id']
            from urllib.parse import urlparse
            listeners.append({'name': name, 'type': 'http', 'listen': '127.0.0.1', 'port': urlparse(line['url']).port, 'rule': name})
            subrules[name] = ([f'DOMAIN-SUFFIX,{domain},DIRECT' for domain in settings['domains']]
                              + [f"MATCH,{line['clash_node']}"])
        result['listeners'], result['sub-rules'] = listeners, subrules
    dns = result.setdefault('dns', {})
    if settings['domains'] and settings['dns']:
        policy = dns.setdefault('nameserver-policy', {})
        for domain in settings['domains']: policy['+.'+domain] = settings['dns']
        dns['fake-ip-filter'] = list(dict.fromkeys(dns.get('fake-ip-filter', [])+['+.'+d for d in settings['domains']]))
    return result


def restore_fragment(config, previous):
    config['rules'] = [row for row in config.get('rules', []) if row not in previous.get('ownedRules', previous['rules'])]
    dns = config.get('dns', {})
    policy = dns.get('nameserver-policy', {})
    for domain in previous['domains']:
        key = '+.'+domain
        if policy.get(key) != previous['dns']: continue
        if key in previous.get('dnsBefore', {}): policy[key] = previous['dnsBefore'][key]
        else: policy.pop(key, None)
    if 'fake-ip-filter' in dns:
        dns['fake-ip-filter'] = [row for row in dns['fake-ip-filter'] if row not in previous.get('addedFilters', [])]


def install(controller, settings, directory, lines=()):
    path = verge_directory()/'profiles/Script.js'
    if not path.is_file(): raise ValueError('未找到 Clash Verge 全局扩展脚本，请先创建全局脚本')
    original = path.read_bytes()
    owned = re.search(re.escape(START)+r'(.*?)'+re.escape(END), original.decode('utf-8'), flags=re.S)
    if START in original.decode('utf-8') and not owned:
        raise ValueError('Clash 中的应用分流片段不完整，请先检查全局脚本')
    if START not in original.decode('utf-8') and any(row.get('name') == GROUP for row in source_config().get('proxy-groups', [])):
        raise ValueError('Clash 中已有同名策略组，请先将“'+GROUP+'”改名再应用')
    text = re.sub(re.escape(START)+r'.*?'+re.escape(END)+r'\n?', '', original.decode('utf-8'), flags=re.S)
    config = source_config()
    fingerprint = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
    baseline_path = Path(directory)/'network-baseline.json'
    baseline = json.loads(baseline_path.read_text()) if owned and baseline_path.exists() else {}
    previous = re.search(r'const network = (\{[^\n]+\});', owned.group(1)) if owned else None
    # Verge regenerates this file only when it applies a profile; API reloads leave it unchanged.
    if baseline.get('fingerprint') == fingerprint:
        config = baseline['config']
    elif previous:
        restore_fragment(config, json.loads(previous.group(1)))
    running = controller.request('GET', '/configs')
    config['mode'] = running.get('mode', config.get('mode', 'rule'))
    config.setdefault('tun', {})['enable'] = bool(running.get('tun', {}).get('enable'))
    staged = configured(config, settings, lines)
    policy = config.get('dns', {}).get('nameserver-policy', {})
    filters = config.get('dns', {}).get('fake-ip-filter', [])
    data = json.dumps({'rules': rules(settings), 'domains': settings['domains'], 'dns': settings['dns'],
                       'ownedRules': [row for row in rules(settings) if row not in config.get('rules', [])],
                       'dnsBefore': {key: policy[key] for domain in settings['domains'] if (key := '+.'+domain) in policy},
                       'addedFilters': ['+.'+domain for domain in settings['domains'] if settings['dns'] and '+.'+domain not in filters],
                       'listeners': [row for row in staged.get('listeners', []) if row.get('name', '').startswith('agent-sessions-')],
                       'subrules': {key: value for key, value in staged.get('sub-rules', {}).items() if key.startswith('agent-sessions-')},
                       'group': next((row for row in staged.get('proxy-groups', []) if row['name'] == GROUP), None),
                       'lines': [{'name': 'agent-sessions-'+line['id'], 'node': line['clash_node']} for line in lines]}, ensure_ascii=False)
    fragment = f'''\n{START}
const agentSessionsOriginalMain = main;
main = function(config, profileName) {{
  config = agentSessionsOriginalMain(config, profileName);
  const network = {data};
  config["find-process-mode"] = "strict";
  const available = new Set((config.proxies || []).map(p => p.name));
  const usable = network.lines.filter(line => available.has(line.node));
  const usableNames = new Set(usable.map(line => line.name));
  if (network.group) network.group.proxies = ["REJECT", ...new Set(usable.map(line => line.node))];
  config.rules = [...new Set([...network.rules, ...(config.rules || [])])];
  config["proxy-groups"] = [...(config["proxy-groups"] || []).filter(g => g.name !== {json.dumps(GROUP)}), ...(network.group ? [network.group] : [])];
  config.listeners = [...(config.listeners || []).filter(l => !l.name.startsWith("agent-sessions-")), ...network.listeners.filter(l => usableNames.has(l.name))];
  config["sub-rules"] = {{...Object.fromEntries(Object.entries(config["sub-rules"] || {{}}).filter(([key]) => !key.startsWith("agent-sessions-"))), ...Object.fromEntries(Object.entries(network.subrules).filter(([key]) => usableNames.has(key)))}};
  if (network.domains.length && network.dns.length) {{
    config.dns = config.dns || {{}};
    config.dns["nameserver-policy"] = config.dns["nameserver-policy"] || {{}};
    for (const domain of network.domains) config.dns["nameserver-policy"]["+." + domain] = network.dns;
    config.dns["fake-ip-filter"] = [...new Set([...(config.dns["fake-ip-filter"] || []), ...network.domains.map(d => "+." + d)])];
  }}
  return config;
}};
{END}
'''
    # Read and stage everything before changing either the script or running core.
    import yaml
    payload = yaml.safe_dump(staged, allow_unicode=True, sort_keys=False)
    backup = Path(directory)/'network-backups'/str(time.time_ns())
    backup.mkdir(parents=True, mode=0o700)
    (backup/'Script.js').write_bytes(original)
    (backup/'runtime.yaml').write_text(yaml.safe_dump(config, allow_unicode=True), encoding='utf-8')
    if path.read_bytes() != original: raise ValueError('Clash 配置刚被修改，请刷新后重试')
    temporary = path.with_suffix('.agent-sessions.tmp')
    temporary.write_text(text.rstrip()+'\n'+fragment, encoding='utf-8')
    temporary.replace(path)
    try: controller.request('PUT', '/configs?force=true', {'payload': payload})
    except Exception:
        path.write_bytes(original)
        raise
    private_json(baseline_path, {'fingerprint': fingerprint, 'config': config})
    return str(backup)
