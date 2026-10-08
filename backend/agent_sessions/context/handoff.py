"""Bounded, provider-neutral reads and local session context references."""
import shlex
import sys
from pathlib import Path


def quote_command(args, platform=None):
    if (platform or sys.platform) == 'win32':
        return '& '+ ' '.join("'"+str(arg).replace("'", "''")+"'" for arg in args)
    return shlex.join(args)


def read(store, key, action='outline', ref='', page=1, query='', through='', from_ref=''):
    data = store.trajectory(key, limit=250)
    if data.get('unavailable_reason'): raise ValueError(data['unavailable_reason'])
    if action == 'status':
        return {k: data.get(k) for k in ('id', 'title', 'provider_label', 'cwd', 'current_status', 'turn_count', 'event_count', 'warnings')}
    events = None
    if from_ref or through or action in ('outline', 'tools'):
        # Page through metadata only; context references never pre-read tool results.
        events = list(data['events']); offset = data['next_offset']
        while offset is not None:
            part = store.trajectory(key, offset, 250); events.extend(part['events']); offset = part['next_offset']
        boundaries = {}
        for label, boundary in (('起点', from_ref), ('终点', through)):
            if not boundary: continue
            target = next((e for e in events if e['ref'] == boundary), None)
            if not target: raise ValueError(f'上下文{label}已不存在，请重新复制上下文引用')
            boundaries[label] = target['position']
        if boundaries.get('起点', 0) > boundaries.get('终点', float('inf')):
            raise ValueError('上下文起点不能晚于终点')
        events = [e for e in events if boundaries.get('起点', 0) <= e['position'] <= boundaries.get('终点', float('inf'))]
    if action in ('message', 'evidence'):
        if not ref: raise ValueError('请指定消息或调用引用 --read-ref')
        if events is not None and not any(e['ref'] == ref for e in events):
            raise ValueError('该引用不在指定的上下文范围内')
        if action == 'evidence' and not query.strip(): raise ValueError('读取结果需要查询词 --read-query')
        detail = store.detail(key, ref, page, 'output' if action == 'evidence' else 'input')
        if action == 'evidence':
            if not detail['output_available']: raise ValueError('此调用没有可独立读取的结果')
            text = detail['text']; pos = text.casefold().find(query.casefold())
            detail['text'] = text[max(0, pos-400):pos+len(query)+1200] if pos >= 0 else ''
            detail['query_found'] = pos >= 0
        return detail
    if action == 'tools': events = [e for e in events if e['kind'] in ('tool', 'subtool')]
    else: events = [e for e in events if e['kind'] in ('user', 'assistant')]
    if page > max(1, (len(events)+19)//20): raise ValueError('页码超过目录长度')
    start = (page-1)*20; rows = events[start:start+20]
    return {'id': data['id'], 'title': data['title'], 'provider': data['provider_label'],
            'cwd': data.get('cwd'), 'through_ref': through or None, 'from_ref': from_ref or None, 'page': page,
            'pages': max(1, (len(events)+19)//20), 'total': len(events),
            'items': [{k: e.get(k) for k in ('ref', 'turn', 'kind', 'name', 'preview', 'status', 'phase')} for e in rows]}


def prompt(store, key, ref, state_home):
    if ref: store.detail(key, ref)
    meta = store.trajectory(key, limit=1)
    if meta.get('unavailable_reason'): raise ValueError(meta['unavailable_reason'])
    command = [sys.executable]
    if not getattr(sys, 'frozen', False): command.append(str(Path(__file__).resolve().parents[3]/'scripts/trajectory_server.py'))
    source, _ = store.resolve(key)
    for field in store.registry.plugins[source].paths:
        command += ['--source-path', field.key+'='+str(store.paths[field.key])]
    command += ['--state-home', str(state_home), '--read-session', meta['id']]
    if ref: command += ['--read-from', ref]
    outline = quote_command(command+['--read-action', 'outline'])
    shell = '（在 PowerShell 中执行）' if sys.platform == 'win32' else ''
    scope = f'从 {ref} 开始的内容（含该消息）' if ref else '的整个会话'
    text = f'''请将“{meta['title']}”（{meta['provider_label']}）{scope}作为上下文参考，以我本次的要求为准。
在同一台电脑运行以下只读命令{shell}查看目录：
{outline}
按需将 outline 换成 message，并追加 --read-ref 消息引用读取原文；用 --read-page N 翻页。
'''
    return {'text': text, 'ref': ref or None, 'from_ref': ref or None, 'session_id': meta['id']}
