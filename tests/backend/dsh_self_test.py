"""Native DSH generations, compressed frames, call identity and incremental reads."""
import hashlib
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
import zstandard
from agent_sessions.sources.catalog import MultiStore
from agent_sessions.sources.dsh import DshStore
from agent_sessions.context.handoff import prompt, read


def record(kind, seq, data):
    return {'type': kind, 'seq': seq, 'time': 1700000000000+seq*1000, 'data': data}


def transcript(version, native):
    message = lambda text: {'content': [{'type': 'text', 'text': text}]}
    rows = [{'type': 'session', 'version': version, 'id': native, 'cwd': '/tmp/dsh-project'},
            record('session/title', 0, {'title': '测试会话'}),
            record('turn/start', 1, {'turn': 1}),
            record('user/message', 2, {**message('原始参数 token=exact '+'全文'*300+'深处检索词'), 'source': {'kind': 'user'}}),
            record('assistant/message', 3, {'turn': 1, 'step': 1, 'message': {'content': [{'type': 'reasoning', 'text': '可见工作过程'}]}}),
            record('tool/call', 4, {'turn': 1, 'step': 1, 'callId': 'same', 'name': 'bash', 'arguments': '{"command":"first"}'}),
            record('tool/call', 5, {'turn': 1, 'step': 2, 'callId': 'same', 'name': 'bash', 'arguments': '{"command":"second"}'})]
    for seq, step, text, error in [(6, 2, 'SECOND 原值', True), (7, 1, 'FIRST 原值', False)]:
        result = {**message(text), 'toolCallId': 'same', 'isError': error} if version >= 3 else {
            'content': [{'type': 'tool-result', 'toolCallId': 'same', 'content': text, 'isError': error}]}
        rows.append(record('tool/result', seq, {'turn': 1, 'step': step, 'message': result}))
    rows += [record('assistant/message', 8, {'turn': 1, 'step': 3, 'message': message('最终回答')}),
             record('turn/end', 9, {'turn': 1, 'reason': {'kind': 'completed'}})]
    return rows


def lines(rows):
    return ''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in rows).encode()


with tempfile.TemporaryDirectory() as folder:
    root = Path(folder).resolve()
    dsh = root/'dsh'
    compressor = zstandard.ZstdCompressor()
    files = {}
    for version in range(5):
        directory = dsh/'sessions/project'/str(version); directory.mkdir(parents=True)
        path = directory/('session.jsonl' if version == 0 else f'session.v{version}.jsonl.zstd')
        rows = transcript(version, str(version))
        path.write_bytes(lines(rows) if version == 0 else compressor.compress(lines(rows[:3]))+compressor.compress(lines(rows[3:])))
        files[version] = path
        if version == 4:
            (directory/'session.jsonl').write_bytes(lines(transcript(0, 'stale')))
    checksums = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in files.values()}
    store = MultiStore(root/'codex', root/'claude', root/'agy', root/'cli', root/'desktop', dsh)
    assert store.sessions(provider='dsh:local')['total'] == 5
    for version in range(5):
        key = 'dsh:local:project/'+str(version)
        data = store.trajectory(key)
        assert data['title'] == '测试会话' and data['turn_count'] == 1 and data['current_status'] == 'completed'
        assert data['event_count'] == 5 and data['tool_count'] == 2
        assert store.detail(key, 'E/4', part='output')['text'] == 'FIRST 原值'
        assert store.detail(key, 'E/5', part='output')['text'] == 'SECOND 原值'
        assert next(e for e in data['events'] if e['ref'] == 'E/5')['status'] == 'error'
        assert store.detail(key, 'E/4')['text'] == '{"command":"first"}'
        assert store.detail(key, 'E/3/R')['text'] == '可见工作过程'
        assert next(e for e in data['events'] if e['ref'] == 'E/8')['phase'] == 'final_answer'
        assert store.trajectory(key, query='深处检索词')['total'] == 1
        assert read(store, key, 'outline', through='E/3/R')['total'] == 2
        instruction = prompt(store, key, 'E/8', root/'state')['text']
        assert '--dsh-home' in instruction and '--read-through E/8' in instruction
        event = next(e for e in data['events'] if e['ref'] == 'E/5')
        midpoint = (event['timeline_start']+event['timeline_end'])/2
        assert store.focus(key, midpoint, midpoint, 'duration')['first']['ref'] in ('E/4', 'E/5')
        assert store.detail(key, 'E/8')['source'] == str(files[version])
    assert store.sessions(query='深处检索词', provider='dsh:local')['total'] == 5
    assert checksums == {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in files.values()}
    # Append a complete frame with an incomplete final JSON line, then finish it.
    target = files[4]; appended = record('user/message', 11, {'content': [{'type': 'text', 'text': '新增问题'}], 'source': {'kind': 'user'}})
    initial = [e['ref'] for e in store.trajectory('dsh:local:project/4')['events']]
    with target.open('ab') as handle: handle.write(compressor.compress(lines([record('turn/start', 10, {'turn': 2})])+lines([appended])[:-1]))
    assert [e['ref'] for e in store.trajectory('dsh:local:project/4')['events']] == initial
    with target.open('ab') as handle: handle.write(compressor.compress(b'\n'))
    updated = store.trajectory('dsh:local:project/4')
    assert updated['events'][-1]['ref'] == 'E/11' and updated['current_status'] == 'in_progress'
    assert store.sessions(query='新增问题', provider='dsh:local')['total'] == 1
    # An unpaired native result remains visible, never masquerades as another call.
    with files[0].open('ab') as handle:
        handle.write(lines([record('tool/result', 12, {'turn': 1, 'step': 9, 'message': {'toolCallId': 'unknown', 'content': '未关联原文'}})]))
    result = next(e for e in store.trajectory('dsh:local:project/0')['events'] if e['name'] == '执行结果')
    assert store.detail('dsh:local:project/0', result['ref'])['text'] == '未关联原文'
    with files[0].open('ab') as handle:
        handle.write(lines([record('tool/call', 13, {'turn': 1, 'step': 1, 'callId': 'same', 'name': 'bash', 'arguments': 'ambiguous'})]))
    assert not store.detail('dsh:local:project/0', 'E/4', part='output')['output_available']
    assert any(e['name'] == '执行结果' and e['preview'] == 'FIRST 原值' for e in store.trajectory('dsh:local:project/0')['events'])
    # Newer unsupported generations are shown as unavailable; old data isn't silently substituted.
    future = dsh/'sessions/project/4/session.v5.jsonl'
    future.write_bytes(lines([{'type': 'session', 'version': 5, 'id': '4'}]))
    store.catalogue_time = 0
    future_view = store.trajectory('dsh:local:project/4')
    assert future_view['event_count'] == 0 and 'v5' in future_view['unavailable_reason']
    # Decoded cache eviction can't overwrite a different session's retained body.
    adapter = DshStore(dsh)
    for number in range(8):
        directory = dsh/'sessions/cache'/str(number); directory.mkdir(parents=True)
        directory.joinpath('session.jsonl').write_bytes(lines(transcript(0, str(number))))
        assert adapter.detail('cache/'+str(number), 'E/8')['text'] == '最终回答'
    assert adapter.detail('cache/3', 'E/8')['text'] == '最终回答'
    assert len(adapter.decoded) == 5
    # Current DSH keeps titles in per-session projections; catalogue needs no full decode.
    projections = dsh/'storages/session_projcache/sessions'; projections.mkdir(parents=True)
    projections.joinpath('3.json').write_text(json.dumps({'version': 1, 'record': {'rows': {'title': {'val': '独立索引标题'}}}}))
    fresh = DshStore(dsh)
    assert next(r for r in fresh.discover() if r['id'] == 'project/3')['title'] == '独立索引标题'
    assert not fresh.decoded
    # DSH workspaces own names and membership, even when Codex uses the same path.
    workspace_path = dsh/'storages/workspace.json'
    workspaces = {'work': {'path': '/tmp/dsh-project', 'title': 'DSH 工作区', 'sessionIds': ['0']}}
    workspace_path.write_text(json.dumps({'tables': {'workspaces': workspaces}}))
    store.catalogue_time = 0
    codex_project = {'id': 'codex-session', 'title': 'Codex 会话', 'updated_at': '2026-09-30T00:00:00Z',
                     'project_id': 'project:codex-work', 'project_label': 'Codex 自定义项目',
                     'project_path': '/tmp/dsh-project', 'project_source': 'membership'}
    with patch.object(store.codex, 'sessions', return_value={'items': [codex_project], 'next_offset': None}):
        listed = store.catalogue()
    owned = next(r for r in listed if r['id'] == 'dsh:local:project/0')
    assert owned['project_label'] == 'DSH 工作区' and owned['project_id'] == 'dsh:workspace:work'
    # Older logs without explicit membership may use a unique DSH directory match.
    assert next(r for r in listed if r['id'] == 'dsh:local:project/3')['project_id'] == owned['project_id']
    workspaces['second'] = {'path': '/tmp/dsh-project', 'title': '另一个 DSH 工作区', 'sessionIds': ['3']}
    workspace_path.write_text(json.dumps({'tables': {'workspaces': workspaces}}))
    listed = {r['native_id']: r for r in fresh.discover() if r['id'].startswith('project/')}
    assert listed['0']['project_label'] == 'DSH 工作区'
    assert listed['3']['project_label'] == '另一个 DSH 工作区'
    assert listed['2']['project_label'] == 'dsh-project' and listed['2']['project_source'] == 'directory'
    # An ambiguous native membership must not silently select either workspace.
    workspaces['second']['sessionIds'].append('0')
    workspace_path.write_text(json.dumps({'tables': {'workspaces': workspaces}}))
    assert next(r for r in fresh.discover() if r['id'] == 'project/0')['project_label'] == 'dsh-project'
    workspace_path.unlink()
    store.catalogue_time = 0
    with patch.object(store.codex, 'sessions', return_value={'items': [codex_project], 'next_offset': None}):
        assert next(r for r in store.catalogue() if r['id'] == 'dsh:local:project/0')['project_label'] == 'dsh-project'

print('DSH self-test: ok (v0-v4, Zstandard frames, step identity, ambiguity, exact results, full search, continuation, focus, append, future version, eviction, native workspaces, Agent isolation, read-only)')
