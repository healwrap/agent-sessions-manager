"""Interpret browser observations separately from optional launch allowlists."""
import ipaddress


def addresses(values):
    result = []
    for value in values:
        try:
            address = ipaddress.ip_address(value)
            if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped: address = address.ipv4_mapped
            if address.is_global and not address.is_multicast and str(address) not in result: result.append(str(address))
        except ValueError: pass
    return result


def valid_observation(value):
    if not isinstance(value, dict): return False
    def strings(rows, limit=512):
        return isinstance(rows, list) and len(rows) <= 64 and all(isinstance(row, str) and len(row) <= limit for row in rows)
    if value.get('kind') == 'dns':
        if set(value) != {'kind', 'status', 'servers', 'errors'} or value['status'] not in ('observed', 'failed'): return False
        servers = value['servers']
        if not isinstance(servers, list) or len(servers) > 64 or not strings(value['errors']): return False
        for server in servers:
            if not isinstance(server, dict) or set(server) != {'ip', 'country', 'info'}: return False
            if not isinstance(server['ip'], str) or not addresses([server['ip']]): return False
            if not isinstance(server['country'], str) or len(server['country']) > 2 or not strings(server['info'], 256): return False
        return bool(servers) == (value['status'] == 'observed')
    if value.get('kind') != 'webrtc' or set(value) != {'kind', 'status', 'candidates', 'errors', 'udp_restricted'}: return False
    if value['status'] not in ('complete', 'timeout', 'unsupported', 'restricted', 'failed') or type(value['udp_restricted']) is not bool: return False
    candidates, errors = value['candidates'], value['errors']
    return (isinstance(candidates, list) and len(candidates) <= 64
            and all(isinstance(row, dict) and set(row) == {'type', 'address'}
                    and row['type'] in ('host', 'srflx', 'relay', 'prflx', 'unknown')
                    and isinstance(row['address'], str) and len(row['address']) <= 253 for row in candidates)
            and isinstance(errors, list) and len(errors) <= 64 and all(type(code) is int and 0 <= code <= 999 for code in errors))


def webrtc_result(row, http_ip):
    observation = row.get('observation', {})
    candidates = observation.get('candidates', [])
    public = addresses(candidate['address'] for candidate in candidates if candidate['type'] != 'relay')
    if not observation:
        public = addresses(part.split(' · ')[-1] for part in row.get('value', '').split('；'))
    value, detail = row.get('value', '本次未执行'), row.get('detail', '')
    def result(state, label, message=value, explanation=detail):
        return {'state': state, 'label': label, 'value': message, 'detail': explanation}
    if public:
        value = '、'.join(public)
        exit_ip = addresses([http_ip])
        if not exit_ip: return result('unknown', '缺少 HTTP 出口', value, '未取得同一浏览器的 HTTP 出口')
        expected = ipaddress.ip_address(exit_ip[0])
        comparable = [ip for ip in public if ipaddress.ip_address(ip).version == expected.version]
        if any(ip != str(expected) for ip in comparable):
            return result('fail', '出口不一致', value, 'HTTP 出口：'+str(expected))
        if len(comparable) != len(public):
            return result('unknown', '地址族待比对', value, '尚未取得另一地址族的 HTTP 出口')
        if observation.get('status') == 'timeout': return result('unknown', '检测超时', value)
        return result('pass', '出口一致', value, 'HTTP 出口：'+str(expected))
    status = observation.get('status')
    if status == 'unsupported' or value == '浏览器不支持 WebRTC': return result('info', '不支持')
    if status == 'restricted': return result('info', '功能受限')
    if status == 'failed' or value == 'WebRTC 采样失败': return result('unknown', '检测失败')
    if status == 'timeout': return result('unknown', '检测超时', 'ICE 收集未在 6 秒内完成')
    if observation.get('errors'): return result('unknown', 'STUN 连接失败', '未取得公网 ICE 地址')
    if status == 'complete':
        relayed = addresses(candidate['address'] for candidate in candidates if candidate['type'] == 'relay')
        return result('pass', '仅中继地址' if relayed else '未暴露公网地址',
                      '、'.join(relayed) if relayed else '未观察到公网 ICE 地址')
    return result('unknown', '未执行' if value in ('本次未执行', '已关闭采样') else '采样信息不足')


def dns_result(row, expected=''):
    observation = row.get('observation', {})
    servers = observation.get('servers', [])
    actual = addresses(server['ip'] for server in servers) if observation else addresses(row.get('value', '').split('、'))
    if not actual:
        return {'state': 'unknown', 'label': '未执行' if row.get('value') in ('本次未执行', '已关闭采样') else '检测失败',
                'value': '未取得公网 DNS 解析器', 'detail': row.get('detail', '')}
    allowed = addresses(value.strip() for value in expected.split(','))
    matches = not allowed or set(actual) <= set(allowed)
    return {'state': 'pass' if allowed and matches else 'fail' if allowed else 'info',
            'label': '解析器匹配' if allowed and matches else '解析器不匹配' if allowed else '已采样',
            'value': '、'.join(actual), 'detail': '允许列表：'+'、'.join(allowed) if allowed else '',
            **({'resolvers': servers} if servers else {})}


def describe_leaks(checks):
    http_ip = next((row['value'] for row in checks if row['id'] == 'browser-http-ip'), '')
    return [{**row, **(webrtc_result(row, http_ip) if row['id'] == 'webrtc' else
                       {key: val for key, val in dns_result(row).items() if key != 'resolvers'} if row['id'] == 'dns' else {})}
            for row in checks]
