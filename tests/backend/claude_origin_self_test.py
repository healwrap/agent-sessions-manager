"""Desktop origin is authoritative even without the independent session index."""
import hashlib
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
from agent_sessions.sources.catalog import MultiStore


def message(native, uid, role, content, parent=None, **extra):
    return dict(type=role, uuid=uid, parentUuid=parent, sessionId=native,
                cwd='/tmp/desktop-project', timestamp='2026-10-02T01:00:00Z',
                message={'role': role, 'content': content}, **extra)


def write(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in rows))


with tempfile.TemporaryDirectory() as folder:
    root = Path(folder)
    roots = [root/name for name in ('codex', 'claude', 'agy', 'agy-cli', 'desktop-index', 'dsh')]
    projects = roots[1]/'projects'
    marked = projects/'-tmp-desktop-project/desktop-marked.jsonl'
    write(marked, [
        dict(type='attachment', uuid='origin', sessionId='desktop-marked', entrypoint='claude-desktop-3p'),
        message('desktop-marked', 'u', 'user', 'token=原值 用户问题', 'origin'),
        message('desktop-marked', 'a', 'assistant', [dict(type='tool_use', id='call', name='bash', input={'command': 'echo exact'})], 'u'),
        message('desktop-marked', 'r', 'user', [dict(type='tool_result', tool_use_id='call', content='完整工具结果')], 'a'),
        message('desktop-marked', 'final', 'assistant', '完整桌面回答 '+ '内容'*300+'深处查询词', 'r'),
        dict(type='custom-title', customTitle='Model identity question', sessionId='desktop-marked'),
    ])
    direct = projects/'project/desktop-direct.jsonl'
    write(direct, [message('desktop-direct', 'u', 'user', '第二个桌面对话', entrypoint='claude-desktop'),
                   message('desktop-direct', 'a', 'assistant', '第二个回答', 'u')])
    cli = projects/'project/cli.jsonl'
    write(cli, [message('cli', 'u', 'user', '用户原话包含 claude-desktop-3p，不代表桌面来源', entrypoint='cli'),
                message('cli', 'a', 'assistant', 'CLI 回答', 'u')])
    duplicate = projects/'other/desktop-marked.jsonl'
    write(duplicate, [message('desktop-marked', 'u', 'user', '另一文件的 CLI 问题'),
                      message('desktop-marked', 'a', 'assistant', '另一文件的 CLI 回答', 'u')])
    before = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (marked, direct, cli, duplicate)}
    store = MultiStore(*roots)
    assert not roots[4].exists()
    with patch('agent_sessions.sources.catalog.time.monotonic', return_value=0.5):
        desktop = store.sessions(provider='claude:desktop')
    assert desktop['total'] == 2
    assert store.sessions(provider='claude:local')['total'] == 2
    key = 'claude:desktop:transcript/-tmp-desktop-project/desktop-marked'
    row = next(r for r in desktop['items'] if r['id'] == key)
    assert row['title'] == 'Model identity question' and row['project_label'] == 'desktop-project'
    assert row['provider_label'] == 'Claude Code Desktop' and row['transcript_available']
    assert next(s for s in store.sources()['items'] if s['id'] == 'claude:desktop')['available']
    trace = store.trajectory(key)
    assert trace['event_count'] == 3 and not trace['unavailable_reason']
    assert store.detail(key, 'M/u')['text'] == 'token=原值 用户问题'
    assert store.detail(key, 'C/a/0', part='output')['text'] == '完整工具结果'
    assert store.sessions(query='深处查询词', provider='claude:desktop')['total'] == 1
    assert store.detail('claude:local:-tmp-desktop-project/desktop-marked', 'M/u')['text'] == 'token=原值 用户问题'
    assert {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in before} == before

    # An independent index supersedes the fallback row without duplicating it.
    metadata = roots[4]/'account/org/indexed.json'
    write(metadata, [dict(sessionId='desktop-index', cliSessionId='desktop-marked', cwd='/tmp/desktop-project',
                          title='桌面索引名称', lastActivityAt=1700000000000)])
    store.catalogue_time = 0
    desktop = store.sessions(provider='claude:desktop')
    assert desktop['total'] == 2
    assert any(r['id'] == 'claude:desktop:account/org/indexed' for r in desktop['items'])
    assert not any(r['id'] == key for r in desktop['items'])
    assert store.detail(key, 'M/u')['text'] == 'token=原值 用户问题'
    assert store.sessions(provider='claude:local')['total'] == 2
    store.disabled = {'claude:desktop'}; store.catalogue_time = 0
    assert store.sessions(provider='claude:local')['total'] == 4
    store.disabled = set()

    # A desktop marker can arrive after the first message; incremental indexes must update ownership.
    later = projects/'project/later.jsonl'
    initial = [message('later', 'u', 'user', '先出现的对话'), message('later', 'a', 'assistant', '已回答', 'u')]
    write(later, initial)
    store.catalogue_time = 0
    assert store.sessions(provider='claude:local')['total'] == 3
    with later.open('a') as f:
        f.write(json.dumps(dict(type='attachment', uuid='origin', parentUuid='a', sessionId='later', entrypoint='claude-desktop-3p')))
    store.catalogue_time = 0
    assert store.sessions(provider='claude:desktop')['total'] == 2
    with later.open('a') as f:
        f.write('\n')
    store.catalogue_time = 0
    assert store.sessions(provider='claude:desktop')['total'] == 3
    assert store.sessions(provider='claude:local')['total'] == 2
    write(later, initial)
    store.catalogue_time = 0
    assert store.sessions(provider='claude:desktop')['total'] == 2
    assert store.sessions(provider='claude:local')['total'] == 3

print('claude origin self-test: ok (native markers, missing index, exact ownership, results, old links, append, read-only)')
