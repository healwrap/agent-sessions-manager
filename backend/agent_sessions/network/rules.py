"""Inject owned Claude nodes and routing, restoring the user's configuration on exit."""
import copy
import hashlib
import json
from pathlib import Path
import re
import time
from .client import verge_directory, source_config
from .domains import CLAUDE_DOMAINS
from agent_sessions.private_files import private_json

START = '// BEGIN AGENT SESSIONS NETWORK'
END = '// END AGENT SESSIONS NETWORK'
GROUP = 'Agent Sessions · Claude'
BEFORE = 'x-agent-sessions-before'
CREATED = '// AGENT SESSIONS CREATED GLOBAL SCRIPT'


def dns_configuration(settings):
    if not settings['dns']: return {}, {}
    policies = {'geosite:cn': settings['dns'], **{'+.'+domain: settings['dns'] for domain in settings['domains']}}
    return policies, {'direct-nameserver': settings['dns'], 'direct-nameserver-follow-policy': True}


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
    aliases = [line['clash_node'] for line in lines]
    if any(row.get('name') in aliases for row in result.get('proxies', [])):
        raise ValueError('当前订阅存在与 Claude 专用节点相同的内部标识')
    result[BEFORE] = {'rules': copy.deepcopy(config.get('rules', [])), 'dns': copy.deepcopy(config.get('dns')),
                      'findProcessMode': config.get('find-process-mode'), 'nodes': aliases}
    result['proxies'] = result.get('proxies', [])+[copy.deepcopy(line['node']) for line in lines]
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
    policies, options = dns_configuration(settings)
    if policies:
        dns.setdefault('nameserver-policy', {}).update(policies)
        dns.update(options)
        dns['fake-ip-filter'] = list(dict.fromkeys(dns.get('fake-ip-filter', [])+['+.'+d for d in settings['domains']]))
    result[BEFORE]['addedRules'] = [row for row in added if row not in config.get('rules', [])]
    result[BEFORE]['dnsAfter'] = copy.deepcopy(result.get('dns'))
    return result


def restore_fragment(config, previous):
    config['rules'] = [row for row in config.get('rules', []) if row not in previous.get('ownedRules', previous['rules'])]
    dns = config.get('dns', {})
    policy = dns.get('nameserver-policy', {})
    policies = previous.get('dnsPolicies', {'+.'+domain: previous['dns'] for domain in previous['domains']})
    for key, value in policies.items():
        if policy.get(key) != value: continue
        if key in previous.get('dnsBefore', {}): policy[key] = previous['dnsBefore'][key]
        else: policy.pop(key, None)
    for key, value in previous.get('dnsOptions', {}).items():
        if dns.get(key) != value: continue
        if key in previous.get('dnsOptionsBefore', {}): dns[key] = previous['dnsOptionsBefore'][key]
        else: dns.pop(key, None)
    if 'fake-ip-filter' in dns:
        dns['fake-ip-filter'] = [row for row in dns['fake-ip-filter'] if row not in previous.get('addedFilters', [])]


def restore_dns(current, before, after):
    """Undo only owned values still present; keep later subscription-script edits."""
    result = copy.deepcopy(current or {})
    original, injected = before or {}, after or {}
    for key, value in injected.items():
        if key in original and original[key] == value: continue
        if key not in result: continue
        if key == 'fake-ip-filter' and isinstance(result[key], list):
            added = [row for row in value if row not in original.get(key, [])]
            result[key] = [row for row in result[key] if row not in added]
            if not result[key] and key not in original: result.pop(key)
        elif isinstance(value, dict) and isinstance(result[key], dict):
            result[key] = restore_dns(result[key], original.get(key), value)
            if not result[key] and key not in original: result.pop(key)
        elif result[key] == value:
            if key in original: result[key] = copy.deepcopy(original[key])
            else: result.pop(key)
    return result


def clean_config(config, directory, fragment=None):
    """Undo our legacy fragment while retaining the currently selected subscription."""
    if BEFORE in config:
        result = copy.deepcopy(config)
        before = result.pop(BEFORE)
        if not isinstance(before, dict) or not {'rules', 'dns', 'findProcessMode', 'nodes'} <= set(before):
            raise ValueError('Clash 中的原配置记录不完整，请从网络备份恢复')
        result['rules'] = [row for row in result.get('rules', []) if row not in before.get('addedRules', [])]
        dns = restore_dns(result.get('dns'), before['dns'], before.get('dnsAfter'))
        if before['dns'] is None and not dns: result.pop('dns', None)
        else: result['dns'] = dns
        if result.get('find-process-mode') == 'strict':
            if before['findProcessMode'] is None: result.pop('find-process-mode', None)
            else: result['find-process-mode'] = before['findProcessMode']
        result['proxies'] = [row for row in result.get('proxies', []) if row.get('name') not in before['nodes']]
        result['proxy-groups'] = [row for row in result.get('proxy-groups', []) if row.get('name') != GROUP]
        result['listeners'] = [row for row in result.get('listeners', []) if not row.get('name', '').startswith('agent-sessions-')]
        result['sub-rules'] = {key: value for key, value in result.get('sub-rules', {}).items() if not key.startswith('agent-sessions-')}
        return result
    fingerprint = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
    baseline_path = Path(directory)/'network-baseline.json'
    baseline = json.loads(baseline_path.read_text()) if baseline_path.exists() else {}
    if baseline.get('fingerprint') == fingerprint:
        return copy.deepcopy(baseline['config'])
    result = copy.deepcopy(config)
    if not fragment: return result
    if fragment:
        previous = re.search(r'const network = (\{[^\n]+\});', fragment)
        if previous:
            data = json.loads(previous.group(1))
            restore_fragment(result, data)
            before = data.get('findProcessBefore', baseline.get('config', {}).get('find-process-mode'))
            if before is None: result.pop('find-process-mode', None)
            else: result['find-process-mode'] = before
    result['proxy-groups'] = [row for row in result.get('proxy-groups', []) if row.get('name') != GROUP]
    result['listeners'] = [row for row in result.get('listeners', []) if not row.get('name', '').startswith('agent-sessions-')]
    result['sub-rules'] = {key: value for key, value in result.get('sub-rules', {}).items() if not key.startswith('agent-sessions-')}
    return result


def legacy_fragment():
    path = verge_directory()/'profiles/Script.js'
    original = path.read_text(encoding='utf-8') if path.is_file() else ''
    found = re.search(re.escape(START)+r'(.*?)'+re.escape(END), original, flags=re.S)
    if START in original and not found: raise ValueError('Clash 中的应用分流片段不完整，请先检查全局脚本')
    return path, original, found


def restore(controller, directory):
    """Restore live subscription output; remove only the old owned script block."""
    path, original, fragment = legacy_fragment()
    source = source_config()
    config = clean_config(source, directory, fragment.group(1) if fragment else None)
    failure = None
    try:
        running = controller.request('GET', '/configs')
        config['mode'] = running.get('mode', config.get('mode', 'rule'))
        config.setdefault('tun', {})['enable'] = bool(running.get('tun', {}).get('enable'))
        import yaml
        controller.request('PUT', '/configs?force=true', {'payload': yaml.safe_dump(config, allow_unicode=True, sort_keys=False)})
    except (ValueError, OSError) as error: failure = error
    if fragment:
        if path.read_text(encoding='utf-8') != original: raise ValueError('Clash 全局脚本刚被修改，请刷新后重试')
        backup = Path(directory)/'network-backups'/str(time.time_ns())
        backup.mkdir(parents=True, mode=0o700)
        (backup/'Script.js').write_text(original, encoding='utf-8')
        text = re.sub(re.escape(START)+r'.*?'+re.escape(END)+r'\n?', '', original, flags=re.S)
        if CREATED in fragment.group(1) and not text:
            path.unlink()
        else:
            temporary = path.with_suffix('.agent-sessions.tmp')
            temporary.write_text(text, encoding='utf-8')
            temporary.replace(path)
        # The generated file may still contain the old block until Verge next reloads it.
        private_json(Path(directory)/'network-baseline.json', {
            'fingerprint': hashlib.sha256(json.dumps(source, sort_keys=True).encode()).hexdigest(), 'config': config})
    if failure: raise failure
    return config


def install(controller, settings, directory, lines=()):
    """Own nodes and rules survive subscription changes through one removable script block."""
    path, original, fragment = legacy_fragment()
    script_existed = path.is_file()
    created = not script_existed or fragment is not None and CREATED in fragment.group(1)
    source = source_config()
    config = clean_config(source, directory, fragment.group(1) if fragment else None)
    if any(row.get('name') == GROUP for row in config.get('proxy-groups', [])):
        raise ValueError('Clash 中已有同名策略组，请先将“'+GROUP+'”改名再应用')
    running = controller.request('GET', '/configs')
    config = copy.deepcopy(config)
    config['mode'] = running.get('mode', config.get('mode', 'rule'))
    config.setdefault('tun', {})['enable'] = bool(running.get('tun', {}).get('enable'))
    staged = configured(config, settings, lines)
    policies, options = dns_configuration(settings)
    data = {'rules': rules(settings), 'nodes': [line['node'] for line in lines],
            'listeners': [row for row in staged.get('listeners', []) if row.get('name', '').startswith('agent-sessions-')],
            'subrules': {key: value for key, value in staged.get('sub-rules', {}).items() if key.startswith('agent-sessions-')},
            'group': next((row for row in staged.get('proxy-groups', []) if row['name'] == GROUP), None),
            'dnsPolicies': policies, 'dnsOptions': options, 'domains': settings['domains'], 'dns': settings['dns']}
    block = f'''{START}
{CREATED if created else ''}
const agentSessionsOriginalMain = typeof main === "function" ? main : config => config;
main = function(config, profileName) {{
  config = agentSessionsOriginalMain(config, profileName);
  const network = {json.dumps(data, ensure_ascii=False)};
  const aliases = new Set(network.nodes.map(n => n.name));
  if ((config.proxies || []).some(n => aliases.has(n.name))) throw new Error("Claude 专用节点标识与订阅冲突");
  if ((config["proxy-groups"] || []).some(g => g.name === {json.dumps(GROUP)})) throw new Error("Claude 专用策略组名称与订阅冲突");
  config[{json.dumps(BEFORE)}] = JSON.parse(JSON.stringify({{rules: config.rules || [], dns: config.dns || null, findProcessMode: config["find-process-mode"] || null, nodes: [...aliases]}}));
  config.proxies = [...(config.proxies || []), ...network.nodes];
  config["find-process-mode"] = "strict";
  config.rules = [...new Set([...network.rules, ...(config.rules || [])])];
  config["proxy-groups"] = [...(config["proxy-groups"] || []).filter(g => g.name !== {json.dumps(GROUP)}), ...(network.group ? [network.group] : [])];
  config.listeners = [...(config.listeners || []).filter(l => !l.name.startsWith("agent-sessions-")), ...network.listeners];
  config["sub-rules"] = {{...(config["sub-rules"] || {{}}), ...network.subrules}};
  if (network.dns.length) {{
    config.dns = config.dns || {{}};
    config.dns["nameserver-policy"] = {{...(config.dns["nameserver-policy"] || {{}}), ...network.dnsPolicies}};
    Object.assign(config.dns, network.dnsOptions);
    config.dns["fake-ip-filter"] = [...new Set([...(config.dns["fake-ip-filter"] || []), ...network.domains.map(d => "+." + d)])];
  }}
  config[{json.dumps(BEFORE)}].addedRules = network.rules.filter(r => !config[{json.dumps(BEFORE)}].rules.includes(r));
  config[{json.dumps(BEFORE)}].dnsAfter = JSON.parse(JSON.stringify(config.dns || null));
  return config;
}};
{END}
'''
    import yaml
    payload = yaml.safe_dump(staged, allow_unicode=True, sort_keys=False)
    runtime = Path(directory)/'network-runtime.yaml'
    temporary = runtime.with_suffix('.tmp')
    temporary.write_text(payload, encoding='utf-8')
    temporary.chmod(0o600)
    temporary.replace(runtime)
    text = re.sub(re.escape(START)+r'.*?'+re.escape(END)+r'\n?', '', original, flags=re.S)
    if path.is_file() != script_existed or (path.read_text(encoding='utf-8') if script_existed else '') != original:
        raise ValueError('Clash 全局脚本刚被修改，请刷新后重试')
    backup = Path(directory)/'network-backups'/str(time.time_ns())
    backup.mkdir(parents=True, mode=0o700)
    (backup/'Script.js').write_text(original, encoding='utf-8')
    path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    script_temp = path.with_suffix('.agent-sessions.tmp')
    script_temp.write_text(text+('' if not text or text.endswith('\n') else '\n')+block, encoding='utf-8')
    script_temp.chmod(0o600)
    script_temp.replace(path)
    try: controller.request('PUT', '/configs?force=true', {'payload': payload})
    except Exception:
        if script_existed: path.write_text(original, encoding='utf-8')
        else: path.unlink()
        raise
    private_json(Path(directory)/'network-baseline.json', {
        'fingerprint': hashlib.sha256(json.dumps(source, sort_keys=True).encode()).hexdigest(), 'config': config})
    return str(runtime)
