"""DSH native model cells, historical schemas, exact timing and attachment reads."""
import hashlib
import json
import tempfile
from pathlib import Path
from agent_sessions.sources.dsh import DshStore
from agent_sessions.sources.dsh_metadata import first_token
from agent_sessions.sources.dsh_detail import tool_shortcuts
from agent_sessions.trajectory.layout import timestamp


def row(kind, seq, data, time=None):
    return {'type': kind, 'seq': seq, 'time': 1700000000000+(seq*100 if time is None else time), 'data': data}


def message(blocks): return {'content': blocks, 'source': {'kind': 'model', 'provider': 'test', 'model': 'original-model'}}
def text(value): return {'type': 'text', 'text': value}
def header(description): return {'header': {'config': {'provider': 'test', 'model': 'original-model'}, 'tools': [
    {'name': 'read_image', 'description': description, 'parameters': {'type': 'object', 'properties': {'path': {'type': 'string'}}}}]}}


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); folder = root/'sessions/project/native'; folder.mkdir(parents=True)
    source = folder/'session.v4.jsonl'; image = bytes.fromhex('89504e470d0a1a0a')+b'fixture exact pixels'
    digest = hashlib.sha256(image).hexdigest(); object_path = root/'attachments/v1/objects'/digest[:2]/digest
    object_path.parent.mkdir(parents=True); object_path.write_bytes(image)
    attachment = {'type': 'image', 'attachment': {'attachmentId': 'sha256:'+digest, 'mediaType': 'image/png', 'bytes': len(image), 'name': 'fixture.png'}}
    thinking = '思考原值 '*1600; output = '答案原值 '*1700
    records = [{'type': 'session', 'version': 4, 'id': 'native', 'cwd': '/tmp/native'},
        row('turn/start', 1, {'turn': 1}), row('user/message', 2, {'content': [text('question')], 'source': {'kind': 'user'}}),
        row('request/header', 3, header('historical original definition')),
        row('step/start', 4, {'turn': 1, 'step': 1}, 1000),
        row('assistant/message', 5, {'turn': 1, 'step': 1, 'message': message([
            {'type': 'tool-call', 'id': 'c1', 'name': 'read_image', 'arguments': '{"path":"exact token=value"}'}]),
            'stream': [{'type': 'tool-call-chunks', 'time0': 1700000001100, 'name': 'read_image', 'args': [''], 'dt': []}],
            'usage': {'inputTokens': 3, 'outputTokens': 8, 'cacheReadTokens': 4}}, 1200),
        row('tool/call', 6, {'turn': 1, 'step': 1, 'name': 'read_image', 'callId': 'c1', 'arguments': '{"path":"exact token=value"}'}, 1200),
        row('tool/ptc-dispatch-start', 7, {'rootCallId': 'c1', 'parentCallId': 'c1', 'subCallId': 'child', 'name': 'read_image', 'arguments': {'path': 'child exact'}}, 1201),
        row('tool/ptc-dispatch', 8, {'rootCallId': 'c1', 'parentCallId': 'c1', 'subCallId': 'child', 'name': 'read_image', 'arguments': {'path': 'child exact'}, 'content': [text('child output')], 'isError': True}, 1202),
        row('tool/result', 9, {'turn': 1, 'step': 1, 'message': {'content': [text('original result token=value'), attachment], 'source': {'kind': 'tool', 'callId': 'c1'}, 'isError': False}}, 1243),
        row('step/end', 10, {'turn': 1, 'step': 1}, 1243),
        row('request/header', 11, header('new definition')),
        row('step/start', 12, {'turn': 1, 'step': 2}, 3000),
        row('assistant/message', 13, {'turn': 1, 'step': 2, 'message': message([{'type': 'reasoning', 'text': thinking}, text(output)]),
            'stream': [{'type': 'text-chunks', 'time0': 1700000003010, 'texts': ['', 'first'], 'dt': [30]}], 'usage': {'outputTokens': 42}}, 4000),
        row('step/end', 14, {'turn': 1, 'step': 2}, 4000),
        row('step/start', 15, {'turn': 1, 'step': 3}, 5000),
        row('tool/call', 16, {'turn': 1, 'step': 3, 'callId': 'c2', 'name': 'read_image', 'arguments': '{}'}, 5100),
        row('step/end', 17, {'turn': 1, 'step': 3}, 5300),
        row('turn/end', 18, {'turn': 1, 'reason': {'kind': 'aborted'}}, 5300),
        row('text-chunks', 19, {'turn': 1, 'step': 1, 'texts': ['duplicated stream ignored']}),
        row('future/visible', 20, {})]
    source.write_text(''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in records))
    original_hash = hashlib.sha256(source.read_bytes()).hexdigest(); store = DshStore(root)
    view = store.trajectory('project/native', limit=250)
    assert view['tool_count'] == 2 and view['turn_summaries']['1']['steps'] == 3
    assert view['step_count'] == 3
    assert view['warnings'] == {'future/visible': 1}
    model = next(e for e in view['events'] if e['ref'] == 'E/5')
    assert model['preview'] == '（仅工具调用）' and model['phase'] == 'tool_calls'
    shortcut = store.detail('project/native', 'E/5')['tool_calls'][0]
    assert shortcut == {'ref': 'E/6', 'name': 'read_image', 'preview': '{"path":"exact token=value"}'}
    assert store.detail('project/native', 'E/2')['message_source'] == {'kind': 'user'}
    assert store.detail('project/native', 'E/5')['message_source'] == {
        'kind': 'model', 'provider': 'test', 'model': 'original-model'}
    assert 'message_source' not in store.detail('project/native', 'E/6')
    other_step = {**next(e for e in view['events'] if e['ref'] == 'E/6'), 'ref': 'another-step', 'step': 99}
    blocks = [{'type': 'tool-call', 'id': 'c1', 'name': 'read_image', 'arguments': 'original args'}]
    related = next(e for e in view['events'] if e['ref'] == 'E/6')
    assert tool_shortcuts({'events': [related, other_step]}, model, blocks)[0]['ref'] == 'E/6'
    assert tool_shortcuts({'events': [related, {**related, 'ref': 'duplicate'}]}, model, blocks)[0]['ref'] is None
    assert model['duration_ms'] == 200 and timestamp(model['first_token_at']) == 1700000001100
    assert model['request_number'] == 1
    assert model['request_cumulative_usage']['outputTokens'] == 8
    assert next(e for e in view['events'] if e['ref'] == 'E/13')['request_number'] == 2
    assert next(e for e in view['events'] if e['ref'] == 'E/13')['request_cumulative_usage']['outputTokens'] == 50
    assert related['request_number'] == 1
    assert store.detail('project/native', 'E/5')['request_tool_calls'] == 1
    assert store.detail('project/native', 'E/5')['request_subtool_calls'] == 1
    assert len([e for e in view['events'] if e['kind'] == 'assistant' and e['step'] == 2]) == 1
    call = next(e for e in view['events'] if e['ref'] == 'E/6')
    assert call['duration_ms'] == 43 and call['output_preview'] == 'original result token=value'
    first = store.detail('project/native', 'E/6')
    assert first['hierarchy_parent_ref'] == 'E/5'
    assert store.detail('project/native', 'E/7')['hierarchy_parent_ref'] == 'E/6'
    assert store.detail('project/native', 'E/16')['hierarchy_parent_ref'] is None
    assert first['tool_schema']['description'] == 'historical original definition'
    assert first['request_config']['model'] == 'original-model'
    assert store.detail('project/native', 'E/16')['tool_schema']['description'] == 'new definition'
    assert next(e for e in view['events'] if e['ref'] == 'E/16')['status'] == 'aborted'
    nested = store.detail('project/native', 'E/7', part='output')
    assert nested['event']['step'] == 1 and nested['event']['turn'] == 1
    assert nested['event']['parent_ref'] == 'E/6' and nested['event']['duration_ms'] == 1 and nested['event']['status'] == 'error'
    assert nested['text'] == 'child output' and first['nested'][0]['ref'] == 'E/7'
    image_detail = store.detail('project/native', 'E/6', part='output')
    assert image_detail['text'] == 'original result token=value' and image_detail['attachments'][0]['index'] == 1
    assert store.attachment('project/native', 'E/6', 1, 'output') == (image, 'image/png')
    for ref, index, part in [('E/6', 0, 'output'), ('E/6', 1, 'input'), ('E/16', 1, 'output')]:
        try: store.attachment('project/native', ref, index, part)
        except FileNotFoundError: pass
        else: raise AssertionError('must only read an image actually referenced by the chosen event')
    object_path.write_bytes(b'changed')
    try: store.attachment('project/native', 'E/6', 1, 'output')
    except ValueError: pass
    else: raise AssertionError('must verify content-addressed object')
    object_path.write_bytes(image)
    combined = []; restored_thinking = []; restored_output = []
    for page in range(1, store.detail('project/native', 'E/13')['pages']+1):
        detail = store.detail('project/native', 'E/13', page)
        combined.append(detail['text']); restored_thinking.append(detail['thinking_text']); restored_output.append(detail['output_text'])
    assert ''.join(combined) == thinking+'\n\n'+output
    assert ''.join(restored_thinking) == thinking and ''.join(restored_output) == output
    assert len(view['overview']) == view['event_count'] and any(e['kind']=='subtool' for e in view['overview'])
    assert hashlib.sha256(source.read_bytes()).hexdigest() == original_hash
    # A long history keeps every independently navigable span, including matches
    # beyond the first page of filtered rows.
    with source.open('a') as handle:
        for seq in range(100, 420):
            handle.write(json.dumps(row('user/message', seq, {'content': [text('every-match')], 'source': {'kind': 'user'}}))+'\n')
    long = store.trajectory('project/native', limit=1, query='every-match')
    assert long['total'] == 320 and len(long['overview']) == long['event_count']
    assert sum(e['search_match'] for e in long['overview']) == 320

assert timestamp(first_token([{'type': 'text-chunks', 'time0': 1000, 'texts': ['', '', 'token'], 'dt': [10, 20]}])) == 1030
assert first_token([{'type': 'chunk', 'time': 1000, 'chunk': {'type': 'usage'}}]) is None
print('DSH parity self-test: ok (native model cells, 43 ms timing, packed first token, historical schema, nested dispatch, original attachment objects, paging, full rail, search, read-only)')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); folder = root/'sessions/project/lifecycle'; folder.mkdir(parents=True)
    records = [{'type':'session','version':4,'id':'lifecycle'}, row('turn/start',1,{'turn':1}),
        row('step/start',2,{'turn':1,'step':1},100),
        row('assistant/attempt',3,{'turn':1,'step':1,'stream':[{'type':'text-chunks','time0':1700000000200,'dt':[],'texts':['attempt token']}]},300),
        row('llm/retry',4,{'turn':1,'step':1,'retry':1,'failure':{'message':'original retry error','code':'original-code'}},400),
        row('assistant/message',5,{'turn':1,'step':1,'message':message([text('settled answer')]),'stream':[{'type':'text-chunks','time0':1700000000500,'dt':[],'texts':['later token']}]},600),
        row('step/end',6,{'turn':1,'step':1},600),
        row('compaction/start',7,{'turn':1,'compactionId':'original-compaction'},1000),
        row('compaction/summary',8,{'turn':1,'compactionId':'original-compaction','summary':'original summary','provider':'test','model':'summary-model','usage':{'outputTokens':5}},1500),
        row('compaction/end',9,{'turn':1,'compactionId':'original-compaction'},2000),
        row('turn/end',10,{'turn':1,'reason':{'kind':'completed'}},2100)]
    folder.joinpath('session.v4.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in records))
    store = DshStore(root); trace = store.trajectory('project/lifecycle')
    assert trace['warnings'] == {} and not any(e['name']=='请求重试' for e in trace['events'])
    detail = store.detail('project/lifecycle','E/5')
    assert timestamp(detail['event']['first_token_at']) == 1700000000200
    assert detail['retries'][0]['failure']['message'] == 'original retry error'
    compaction = store.detail('project/lifecycle','E/7')
    assert compaction['text']=='original summary' and compaction['event']['duration_ms']==1000
    assert compaction['event']['request_number'] == 2
    assert compaction['event']['request_cumulative_usage']['outputTokens'] == 5
    assert compaction['event']['model']=='summary-model' and trace['compactions']==1
print('DSH lifecycle self-test: ok (retry belongs to model step, first attempt token retained, compaction summary and timing)')

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); folder = root/'sessions/project/prompts'; folder.mkdir(parents=True)
    records = [{'type':'session','version':4,'id':'prompts'},
        row('system/message',1,{'message': {'content':[text('original system')], 'source':{'kind':'system'}}}),
        row('request/header',2,header('original tool')),
        row('system/message',3,{'message': {'content':[text('updated system')], 'source':{'kind':'system'}}}),
        row('request/header',4,header('updated tool'))]
    folder.joinpath('session.v4.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in records))
    store = DshStore(root)
    initial = store.detail('project/prompts','E/1')
    assert initial['prompt_snapshot']['system'] == 'original system'
    assert initial['prompt_snapshot']['tools'][0]['description'] == 'original tool'
    assert 'previous_prompt_snapshot' not in initial
    updated = store.detail('project/prompts','E/3')
    assert updated['prompt_snapshot']['system'] == 'updated system'
    assert updated['prompt_snapshot']['tools'][0]['description'] == 'updated tool'
    assert updated['previous_prompt_snapshot']['system'] == 'original system'
    assert updated['previous_prompt_snapshot']['tools'][0]['description'] == 'original tool'
    tools_change = store.detail('project/prompts','E/4')
    assert tools_change['prompt_snapshot']['system'] == 'updated system'
    assert tools_change['previous_prompt_snapshot']['tools'][0]['description'] == 'original tool'
print('DSH prompt snapshot self-test: ok (historical system and tool definitions, previous state)')
