"""Native Cursor formats, WAL refresh, bounded reads and portable settings."""
import hashlib
import json
import shlex
import sqlite3
import subprocess
import tempfile
from pathlib import Path, PureWindowsPath
from agent_sessions.sources.catalog import MultiStore
from agent_sessions.sources.cursor import CursorStore
from agent_sessions.paths import cursor_root
from agent_sessions.settings import AppSettings, SOURCE_KEYS, ViewSettings
from agent_sessions.api.server import configured_store
from agent_sessions.context.handoff import prompt

assert cursor_root('darwin', Path('/Users/example'), {}) == Path('/Users/example/Library/Application Support/Cursor/User')
assert cursor_root('win32', PureWindowsPath('C:/Users/example'), {'APPDATA': 'D:/Roaming'}) == PureWindowsPath('D:/Roaming/Cursor/User')
assert cursor_root('linux', Path('/home/example'), {'XDG_CONFIG_HOME': '/data/config'}) == Path('/data/config/Cursor/User')


def put(db, table, key, value):
    db.execute('insert or replace into '+table+' values(?,?)', (key, json.dumps(value, ensure_ascii=False)))
    db.commit()


def setup(path, split=True):
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.execute('pragma journal_mode=wal')
    db.execute('create table ItemTable(key text primary key,value text)')
    if split: db.execute('create table cursorDiskKV(key text primary key,value text)')
    db.commit()
    return db


def digest(path):
    return {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (path, Path(str(path)+'-wal')) if p.exists()}


with tempfile.TemporaryDirectory() as folder:
    root = Path(folder).resolve()
    roots = [root/n for n in ('codex', 'claude', 'agy', 'agy-cli', 'desktop-index', 'dsh', 'Cursor histories/User')]
    global_path = roots[6]/'globalStorage/state.vscdb'
    db = setup(global_path)
    workspace_path = roots[6]/'workspaceStorage/local/state.vscdb'
    old = setup(workspace_path, split=False)
    workspace_path.with_name('workspace.json').write_text(json.dumps({'folder': 'file:///tmp/Native%20Cursor%20Project'}))
    try:
        headers = [dict(composerId='alpha', name='原生 Cursor 标题', createdAt=1700000000000, lastUpdatedAt=1700000001000,
                        workspaceIdentifier={'id': 'own', 'uri': {'scheme': 'file', 'external': 'file:///tmp/Own%20Project'}}),
                   dict(composerId='missing', name='只有索引', createdAt=1700000000000),
                   dict(composerId='draft', name='不应显示的草稿', isDraft=True),
                   dict(composerId='empty-window', name='没有项目的会话', workspaceIdentifier={'id': 'empty-window'})]
        put(db, 'ItemTable', 'composer.composerHeaders', {'allComposers': headers})
        bubbles = [dict(bubbleId='u', type=1, text='token=原值 用户问题', createdAt='2026-10-02T01:00:00Z'),
                   dict(bubbleId='thinking', type=2, text='', thinking={'text': 'HIDDEN-REASONING'}, allThinkingBlocks=['HIDDEN-BLOCK']),
                   dict(bubbleId='call', type=2, toolFormerData={'name': 'run_terminal_cmd', 'status': 'completed',
                        'toolCallId': 'same-call-id', 'rawArgs': '{"command":"echo value=原值"}',
                        'params': '{"do_not_use":"derived"}', 'result': 'RESULT-ONLY\n'+'完整输出'*4000}),
                   dict(bubbleId='call2', type=2, toolFormerData={'name': 'read_file', 'status': 'completed',
                        'toolCallId': 'same-call-id', 'rawArgs': '{}', 'result': ''}),
                   dict(bubbleId='a', type=2, text='完整回答 '+ '内容'*400+'深处检索词', createdAt='2026-10-02T01:01:00Z'),
                   dict(bubbleId='system', type=3, text='HIDDEN-SYSTEM'),
                   dict(bubbleId='simulated', type=1, text='SIMULATED', isSimulatedMsg=True)]
        ordered = [dict(bubbleId=b['bubbleId'], type=b['type']) for b in bubbles]+[{'bubbleId': 'u'}, {'bubbleId': 'gone'}, {'bubbleId': 'broken'}, {'bubbleId': 'nonrenderable', 'grouping': {'isRenderable': False}}]
        put(db, 'cursorDiskKV', 'composerData:alpha', {'status': 'completed', 'fullConversationHeadersOnly': ordered})
        for bubble in bubbles: put(db, 'cursorDiskKV', 'bubbleId:alpha:'+bubble['bubbleId'], bubble)
        db.execute("insert into cursorDiskKV values('bubbleId:alpha:broken','{')"); db.commit()
        put(db, 'cursorDiskKV', 'composerData:empty-window', {'status': 'completed', 'fullConversation': [dict(bubbleId='u', type=1, text='没有项目'), dict(bubbleId='a', type=2, text='回答')]})
        put(old, 'ItemTable', 'composer.composerData', {'allComposers': [dict(composerId='beta', name='旧版内嵌消息'), dict(composerId='alpha', name='不应覆盖全局标题'), dict(composerId='empty-window', name='不应借用当前工作区')]})
        put(old, 'ItemTable', 'composerData:beta', {'status': 'completed', 'conversation': [dict(bubbleId='u', type=1, text='旧版用户原话'), dict(bubbleId='a', type=2, text='旧版完整回答')]})
        before = digest(global_path), digest(workspace_path)
        store = MultiStore(*roots)
        rows = store.sessions(provider='cursor:desktop')['items']
        assert len(rows) == 4 and {r['provider_label'] for r in rows} == {'Cursor'}
        assert next(r for r in rows if r['native_id'] == 'alpha')['project_label'] == 'Own Project'
        assert next(r for r in rows if r['native_id'] == 'beta')['project_label'] == 'Native Cursor Project'
        assert next(r for r in rows if r['native_id'] == 'empty-window')['project_label'] == '未分配项目'
        # Repeated catalogue reads must not expose internal Paths or DB locations.
        json.dumps(store.adapters['cursor:desktop'].discover())
        key = 'cursor:desktop:alpha'
        trace = store.trajectory(key, limit=2)
        assert trace['event_count'] == 4 and trace['tool_count'] == 2 and trace['next_offset'] == 2
        assert trace['warnings']['cursor_missing_bubbles'] == 2
        all_events = store.trajectory(key)['events']
        assert [e['ref'] for e in all_events] == ['M/u', 'C/call', 'C/call2', 'M/a']
        assert all(e['duration_ms'] is None for e in all_events)
        assert store.detail(key, 'M/u')['text'] == 'token=原值 用户问题'
        assert store.detail(key, 'C/call')['text'] == '{"command":"echo value=原值"}'
        result = store.detail(key, 'C/call', part='output')
        assert result['output_available'] and result['pages'] == 3 and result['line'] is None
        assert result['source_key'] == 'bubbleId:alpha:call'
        assert store.detail(key, 'C/call', page=3, part='output')['text']
        assert store.detail(key, 'C/call2', part='output')['output_available']
        assert store.detail(key, 'C/call2', part='output')['text'] == ''
        assert store.sessions(query='深处检索词', provider='cursor:desktop')['total'] == 1
        assert store.trajectory(key, query='深处检索词')['events'][0]['ref'] == 'M/a'
        for hidden in ('HIDDEN-REASONING', 'HIDDEN-BLOCK', 'HIDDEN-SYSTEM', 'RESULT-ONLY', 'SIMULATED'):
            assert store.sessions(query=hidden, provider='cursor:desktop')['total'] == 0
        assert store.focus(key, 0, 1)['count'] == 4
        missing = store.trajectory('cursor:desktop:missing')
        assert missing['event_count'] == 0 and missing['unavailable_reason']
        assert store.detail('cursor:desktop:beta', 'M/a')['text'] == '旧版完整回答'
        assert before == (digest(global_path), digest(workspace_path))
        assert store.trajectory(key)['current_status'] == 'completed'
        put(db, 'cursorDiskKV', 'composerData:alpha', {'status': 'aborted', 'fullConversationHeadersOnly': ordered})
        assert store.trajectory(key)['current_status'] == 'aborted'
        put(db, 'cursorDiskKV', 'composerData:alpha', {'status': 'generating', 'fullConversationHeadersOnly': ordered})
        assert store.trajectory(key)['current_status'] == 'in_progress'
        put(db, 'cursorDiskKV', 'composerData:alpha', {'status': 'completed', 'fullConversationHeadersOnly': ordered})

        # Committed WAL-only changes must invalidate selected histories and search.
        bubbles[4]['text'] = '更新后的原话'
        put(db, 'cursorDiskKV', 'bubbleId:alpha:a', bubbles[4])
        assert store.detail(key, 'M/a')['text'] == '更新后的原话'
        assert store.trajectory(key)['version'] != trace['version']
        assert store.sessions(query='深处检索词', provider='cursor:desktop')['total'] == 0
        assert store.sessions(query='更新后的原话', provider='cursor:desktop')['total'] == 1

        # Native header-table migrations override obsolete JSON header lists.
        db.execute('create table composerHeaders(composerId text primary key,value text)')
        put(db, 'composerHeaders', 'alpha', {**headers[0], 'name': '迁移后的标题'})
        put(db, 'ItemTable', 'composer.composerHeaders.tableGateEnabled', True)
        store.catalogue_time = 0
        assert next(r for r in store.sessions(provider='cursor:desktop')['items'] if r['native_id'] == 'alpha')['title'] == '迁移后的标题'

        preferences = ViewSettings(root/'state')
        preferences.write({'pinned': [key], 'aliases': {key: '自己的名称'}, 'projectAssignments': {key: {'project_id': 'manual', 'project_label': '自己归类', 'project_path': '/tmp/manual'}}})
        store.settings = preferences; store.catalogue_time = 0
        assert next(r for r in store.sessions(query='自己的名称', provider='cursor:desktop')['items'] if r['id'] == key)['project_label'] == '自己归类'
        settings = AppSettings(root/'state', roots)
        legacy = {**settings.defaults, 'paths': {k: str(p) for k, p in zip(SOURCE_KEYS[:-1], roots)}, 'enabled': {k: False for k in SOURCE_KEYS[:-1]}}
        settings.path.write_text(json.dumps(legacy))
        config = settings.read()
        assert config['paths']['cursor:desktop'] == str(roots[6]) and config['enabled']['cursor:desktop']
        assert settings.validate(legacy) == config
        config['enabled']['cursor:desktop'] = False
        disabled = configured_store(config, preferences)
        assert disabled.sessions()['total'] == 0
        try: disabled.detail(key, 'M/a')
        except ValueError: pass
        else: raise AssertionError('Disabled Cursor must not remain readable')
        # Restore enabled settings for the exact copied read command.
        config['enabled']['cursor:desktop'] = True
        settings.write(config)
        text = prompt(store, key, 'M/a', root/'state')['text']
        command = next(line for line in text.splitlines() if '--read-action outline' in line and line.startswith('/'))
        restored = json.loads(subprocess.check_output(shlex.split(command), text=True))
        assert restored['provider'] == 'Cursor' and restored['total'] == 2
        assert '--cursor-home' in command
        assert CursorStore(roots[6].parent).discover()
    finally:
        db.close(); old.close()
print('cursor self-test: ok (split/inline storage, native workspace, deduplication, hidden fields, exact results, paging, WAL refresh, search, settings, handoff, read-only)')
