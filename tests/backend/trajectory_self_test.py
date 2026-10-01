#!/usr/bin/env python3
"""Exercise the real local HTTP adapter with isolated legacy and Desktop records."""
from __future__ import annotations

import hashlib
import json
import tempfile
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from agent_sessions.api import server as trajectory
from agent_sessions.context.indexing import find_call
from agent_sessions.context.artifacts import render_evidence
from agent_sessions.context.locator import visible_messages

ID = '11111111-2222-3333-4444-555555555555'


def entry(kind, payload, second=0):
    return json.dumps({'timestamp': f'2026-09-30T00:00:{second:02d}Z', 'type': kind,
                       'payload': payload}, ensure_ascii=False) + '\n'


def main():
    with tempfile.TemporaryDirectory(prefix='codex-trajectory-test-') as temp:
        root = Path(temp)
        directory = root / 'sessions' / '2026' / '09' / '30'
        directory.mkdir(parents=True)
        source = directory / f'rollout-test-{ID}.jsonl'
        user = '原值 token=abc123 https://example.test/?token=original\n<script>throw 1</script>\n' + '长消息' * 2600 + '末尾检索词'
        result = '工具结果专属标记 token=output-original\n' + '结果' * 6000
        rows = [
            entry('session_meta', {'id': ID, 'cwd': '/tmp/project'}),
            entry('response_item', {'type': 'message', 'role': 'system', 'content': 'SYSTEM-HIDDEN'}),
            entry('event_msg', {'type': 'task_started', 'turn_id': 'one'}, 1),
            entry('event_msg', {'type': 'user_message', 'message': user}, 2),
            entry('event_msg', {'type': 'item_completed', 'turn_id': 'one',
                              'item': {'type': 'UserMessage', 'id': 'u1', 'content': [{'type': 'text', 'text': user}]}}, 2),
            entry('event_msg', {'type': 'item_completed', 'turn_id': 'one',
                              'item': {'type': 'AgentMessage', 'id': 'a1', 'phase': 'commentary',
                                       'content': [{'type': 'Text', 'text': '助手可见消息'}]}}, 3),
            entry('event_msg', {'type': 'agent_message', 'phase': 'commentary', 'message': '助手可见消息'}, 3),
            entry('event_msg', {'type': 'item_completed', 'turn_id': 'one',
                              'item': {'type': 'Reasoning', 'raw_content': 'REASONING-HIDDEN'}}, 4),
            entry('response_item', {'type': 'custom_tool_call', 'name': 'exec', 'call_id': 'c1',
                                   'input': 'text(await tools.exec_command({cmd:"echo original",token:"input-original"}));'}, 5),
            entry('response_item', {'type': 'custom_tool_call_output', 'call_id': 'c1',
                                   'output': result}, 7),
            entry('compacted', {'replacement_history': 'COMPACTION-HIDDEN'}, 8),
            entry('token_usage_record', {'hidden': 'TOKEN-HIDDEN'}, 8),
            entry('event_msg', {'type': 'task_complete', 'turn_id': 'one'}, 9),
            # Desktop items can identify a new turn even without a task_started event.
            entry('event_msg', {'type': 'item_completed', 'turn_id': 'two',
                              'item': {'type': 'UserMessage', 'id': 'u2', 'content': [
                                  {'type': 'text', 'text': '当前未完成消息'},
                                  {'type': 'local_image', 'path': '/tmp/original-image.png'}]}}, 10),
        ]
        source.write_text(''.join(rows))
        before = hashlib.sha256(source.read_bytes()).hexdigest()
        (root / 'session_index.jsonl').write_text(json.dumps({'id': ID, 'thread_name': '测试轨迹',
                                                            'updated_at': '2026-09-30T00:00:10Z'})+'\n')
        store = trajectory.Store(root)
        server = ThreadingHTTPServer(('127.0.0.1', 0), trajectory.Handler)
        server.store = store
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{server.server_port}'

        def request(path, params=None, headers=None, method='GET'):
            url = base + path + ('?' + urlencode(params) if params else '')
            req = Request(url, headers=headers or {}, method=method)
            try:
                with urlopen(req, timeout=10) as response:
                    return response.status, response.read(), response.headers
            except HTTPError as error:
                return error.code, error.read(), error.headers

        def get(path, **params):
            status, body, _ = request(path, params)
            assert status == 200, (status, body)
            return json.loads(body)

        try:
            assert get('/api/sessions')['items'][0]['title'] == '测试轨迹'
            assert get('/api/sessions')['items'][0]['project_id'] == 'directory:/tmp/project'
            # Explicit membership wins even when two named projects share a directory.
            other_id = '22222222-2222-3333-4444-555555555555'
            loose_id = '33333333-2222-3333-4444-555555555555'
            for key in (other_id, loose_id):
                (directory / f'rollout-test-{key}.jsonl').write_text(entry('session_meta', {'id': key, 'cwd': '/tmp/project'}))
            state_path = root / '.codex-global-state.json'
            project_state = {'local-projects': {
                'alpha': {'name': '项目甲', 'rootPaths': ['/tmp/project']},
                'beta': {'name': '项目乙', 'rootPaths': ['/tmp/project']}},
                'thread-project-assignments': {
                    ID: {'projectKind': 'local', 'projectId': 'alpha'},
                    other_id: {'projectKind': 'local', 'projectId': 'beta'}},
                'projectless-thread-ids': [loose_id]}
            state_path.write_text(json.dumps(project_state, ensure_ascii=False))
            state_before = state_path.read_bytes()
            store.refresh_files()
            catalogue = get('/api/sessions')
            by_id = {item['id']: item for item in catalogue['items']}
            assert by_id[ID]['project_label'] == '项目甲'
            assert by_id[other_id]['project_label'] == '项目乙'
            assert by_id[loose_id]['project_id'] == 'projectless'
            assert get('/api/sessions', project='project:alpha')['total'] == 1
            assert get('/api/sessions', q='项目乙')['items'][0]['id'] == other_id
            assert get('/api/sessions', limit=1)['next_offset'] == 1
            assert len(catalogue['projects']) == 3
            data = get('/api/trajectory', id=ID)
            assert data['project_id'] == 'project:alpha'
            assert data['turn_count'] == 2 and data['compactions'] == 1
            assert not data['warnings'], data['warnings']
            assert len([e for e in data['events'] if e['kind'] == 'user']) == 2
            assert len([e for e in data['events'] if e['kind'] == 'assistant']) == 1
            assert len([e for e in data['events'] if e['kind'] == 'context']) == 1
            serialized = json.dumps(data, ensure_ascii=False)
            assert all(hidden not in serialized for hidden in ['SYSTEM-HIDDEN', 'REASONING-HIDDEN', 'COMPACTION-HIDDEN', 'TOKEN-HIDDEN'])
            assert '工具结果专属标记' not in serialized  # Results are lazy, never in the ledger.
            assert 'input-original' in serialized and 'token=abc123' in serialized
            first = get('/api/event', id=ID, ref='T001/U01')
            second = get('/api/event', id=ID, ref='T001/U01', page=2)
            assert first['text']+second['text'] == user and len(first['text']) <= trajectory.PAGE_CHARS
            assert get('/api/trajectory', id=ID, q='末尾检索词')['total'] == 1
            searched = get('/api/trajectory', id=ID, q='末尾检索词')
            assert sum(span['search_match'] for span in searched['overview']) == 1
            assert all(span['end_position'] >= span['position'] for span in searched['overview'])
            focused = get('/api/trajectory-focus', id=ID, start=0, end=1)
            assert focused['count'] == len([e for e in data['events'] if e['kind'] != 'subtool'])
            assert set(focused['first']) == {'ref', 'position'}  # Navigation never reads evidence.
            tool_event = next(e for e in data['events'] if e['ref'] == 'T001/C001')
            point = tool_event['position'] / (data['event_count']-1)
            exact = get('/api/trajectory-focus', id=ID, start=point, end=point)
            assert exact['first']['ref'] == 'T001/C001' and exact['count'] == 1
            assert get('/api/trajectory-focus', id=ID, start=.251, end=.252)['count'] == 0
            time_point = (tool_event['timeline_start']+tool_event['timeline_end'])/2
            assert get('/api/trajectory-focus', id=ID, start=time_point+.01, end=time_point-.01, mode='duration')['first']['ref'] == 'T001/C001'
            assert request('/api/trajectory-focus', {'id': ID, 'start': 'nan', 'end': 1})[0] == 400
            assert request('/api/trajectory-focus', {'id': ID, 'start': -1, 'end': 1})[0] == 400
            assert get('/api/trajectory', id=ID, kind='messages')['total'] == 3
            assert get('/api/trajectory', id=ID, offset=1, limit=2)['next_offset'] == 3
            output = get('/api/event', id=ID, ref='T001/C001', part='output')
            assert output['text'].startswith('工具结果专属标记') and output['pages'] == 2
            single = get('/api/event', id=ID, ref='T001/C001.1', part='output')
            assert not single['shared_output'] and single['result_match'] == 'sequence'
            assert single['text'] == output['text']
            assert get('/api/event', id=ID, ref='T001/C001')['event']['duration_ms'] == 2000
            assert get('/api/event', id=ID, ref='T002/M01')['text'].find('/tmp/original-image.png') >= 0
            assert list(visible_messages(source))[-1] == ('user', '当前未完成消息')
            assert request('/api/sessions', headers={'Origin': 'https://example.test'})[0] == 403
            assert request('/api/sessions', headers={'Host': 'attacker.test'})[0] == 403
            assert request('/api/sessions', headers={'Sec-Fetch-Site': 'cross-site'})[0] == 403
            assert request('/api/event', {'id': '/etc/passwd', 'ref': 'T001/U01'})[0] == 400
            assert request('/../SKILL.md')[0] == 404
            assert request('/api/event', {'id': ID, 'ref': 'T001/U01', 'page': 99})[0] == 400
            assert request('/api/event', {'id': ID, 'ref': 'missing'})[0] == 404
            assert request('/api/sessions', method='POST')[0] == 501
            for path in ['/', '/icons.svg', '/harness-license.txt'] + ['/assets/'+p.name for p in (trajectory.ASSETS/'assets').iterdir()]:
                status, body, headers = request(path)
                assert status == 200 and len(body) > 10
                assert headers['Cache-Control'] == 'no-store'
                assert "connect-src 'self'" in headers['Content-Security-Policy']
            assert hashlib.sha256(source.read_bytes()).hexdigest() == before
            assert state_path.read_bytes() == state_before
            # Half-written records must not surface; the completed append must appear.
            appended = entry('event_msg', {'type': 'item_completed', 'turn_id': 'two',
                                         'item': {'type': 'AgentMessage', 'id': 'a2', 'content': [{'type': 'Text', 'text': '新追加消息'}]}}, 11)
            with source.open('a') as handle:
                handle.write(appended[:-1])
            assert get('/api/trajectory', id=ID, q='新追加消息')['total'] == 0
            with source.open('a') as handle:
                handle.write('\n')
            assert get('/api/trajectory', id=ID, q='新追加消息')['total'] == 1
            # A range deep inside an aggregated span must resolve off the first page.
            long_id = '44444444-2222-3333-4444-555555555555'
            long_source = directory / f'rollout-test-{long_id}.jsonl'
            long_source.write_text(entry('session_meta', {'id': long_id, 'cwd': '/tmp/project'}) + ''.join(
                entry('event_msg', {'type': 'user_message', 'message': f'第 {i} 条'}) for i in range(800)))
            store.refresh_files()
            long_data = get('/api/trajectory', id=long_id)
            middle_position = 601
            long_focus = get('/api/trajectory-focus', id=long_id, start=middle_position/799, end=middle_position/799)
            assert long_focus['count'] == 1 and long_focus['first']['position'] == middle_position
            target_page = get('/api/trajectory', id=long_id, offset=600)
            assert any(e['ref'] == long_focus['first']['ref'] for e in target_page['events'])
            matched_id = '55555555-2222-3333-4444-555555555555'
            matched_source = directory / f'rollout-test-{matched_id}.jsonl'
            program = 'const rs=await Promise.allSettled([tools.exec_command({cmd:"one"}),tools.exec_command({cmd:"two"})]);rs.forEach((r,i)=>text({i,...r}));'
            zero = json.dumps({'i': 0, 'status': 'fulfilled', 'value': {'exit_code': 0, 'output': '独立第一条 token=original'}}, ensure_ascii=False)
            one = json.dumps({'i': 1, 'status': 'rejected', 'reason': {'message': '独立第二条错误'}}, ensure_ascii=False)
            matched_source.write_text(entry('session_meta', {'id': matched_id, 'cwd': '/tmp/project'}) +
                                      entry('response_item', {'type': 'custom_tool_call', 'name': 'exec', 'call_id': 'match', 'input': program}) +
                                      entry('response_item', {'type': 'custom_tool_call_output', 'call_id': 'match', 'output': [
                                          {'type': 'input_text', 'text': zero}, {'type': 'input_text', 'text': one}]}) +
                                      entry('response_item', {'type': 'custom_tool_call', 'name': 'exec', 'call_id': 'ambiguous', 'input': 'if(ok){text(await tools.exec_command({cmd:"one"}));text(await tools.exec_command({cmd:"two"}));}'}) +
                                      entry('response_item', {'type': 'custom_tool_call_output', 'call_id': 'ambiguous', 'output': '不能归因的组合输出'}))
            store.refresh_files()
            ledger = get('/api/trajectory', id=matched_id)
            assert '独立第一条' not in json.dumps(ledger, ensure_ascii=False)
            a = get('/api/event', id=matched_id, ref='T001/C001.1', part='output')
            b = get('/api/event', id=matched_id, ref='T001/C001.2', part='output')
            assert a['text'] == zero and b['text'] == one and a['text'] != b['text']
            assert a['event']['status'] == 'success' and b['event']['status'] == 'error'
            assert not a['shared_output'] and a['parent_ref'] == 'T001/C001'
            unavailable = get('/api/event', id=matched_id, ref='T001/C002.1', part='output')
            assert unavailable['text'] == '' and not unavailable['output_available']
            assert unavailable['result_match'] == 'unmatched' and unavailable['parent_output_available']
            assert get('/api/event', id=matched_id, ref=unavailable['parent_ref'], part='output')['text'] == '不能归因的组合输出'
            parsed = store.session(matched_id)
            _, child = find_call(parsed['turns'], 'T001/C001.1', True)
            evidence = render_evidence(parsed['index'], parsed['source'], child, '独立', 1)
            assert '独立第一条' in evidence and '独立第二条' not in evidence
            _, child = find_call(parsed['turns'], 'T001/C002.1', True)
            evidence = render_evidence(parsed['index'], parsed['source'], child, '不能归因', 1)
            assert '未匹配' in evidence and '组合输出入口' in evidence and '命中 1' not in evidence
            # Aggregated positions must contain a non-leading selection, and search
            # must light up the aggregate rather than only its first message.
            long_id = '44444444-2222-3333-4444-555555555555'
            long_source = directory / f'rollout-test-{long_id}.jsonl'
            long_source.write_text(entry('session_meta', {'id': long_id, 'cwd': '/tmp/project'}) +
                                   ''.join(entry('event_msg', {'type': 'agent_message',
                                                             'message': f'聚合消息 {i}'}) for i in range(510)))
            store.refresh_files()
            aggregate = get('/api/trajectory', id=long_id, q='聚合消息 1')
            assert aggregate['event_count'] == 510
            assert len(aggregate['overview']) <= 250
            target = aggregate['events'][0]
            span = next(s for s in aggregate['overview'] if s['position'] <= target['position'] <= s['end_position'])
            assert span['count'] > 1 and span['search_match']
            assert span['ref'] != target['ref']
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
    print('trajectory self-test: ok (project membership, Desktop/legacy, lazy content, pagination, live append, read-only HTTP)')


if __name__ == '__main__':
    main()
