"""Shared Claude transcripts and optional desktop indexes form one source."""
import hashlib
import json
import tempfile
from pathlib import Path, PureWindowsPath
from agent_sessions.paths import claude_desktop_root
from agent_sessions.settings import AppSettings, SOURCE_KEYS
from agent_sessions.sources.catalog import MultiStore

assert claude_desktop_root('darwin', Path('/Users/example'), {}) == Path('/Users/example/Library/Application Support/Claude/claude-code-sessions')
assert claude_desktop_root('win32', PureWindowsPath('C:/Users/example'), {'APPDATA': 'D:/Roaming'}) == PureWindowsPath('D:/Roaming/Claude/claude-code-sessions')
assert claude_desktop_root('linux', Path('/home/example'), {'XDG_CONFIG_HOME': '/data/config'}) == Path('/data/config/Claude/claude-code-sessions')

with tempfile.TemporaryDirectory() as folder:
    root = Path(folder).resolve()
    roots = [root/name for name in ('codex', 'claude', 'agy', 'agy-cli', 'claude-desktop', 'dsh')]
    transcripts = roots[1]/'projects/-tmp-project'
    transcripts.mkdir(parents=True)
    for native in ('desktop-code', 'cli-code'):
        rows = [dict(type='user', uuid='u', sessionId=native, cwd='/tmp/project', message={'content': '完整用户原话'}),
                dict(type='assistant', uuid='a', parentUuid='u', message={'content': '完整回答'})]
        (transcripts/(native+'.jsonl')).write_text(''.join(json.dumps(r)+'\n' for r in rows))
    metadata = roots[4]/'account/org'
    metadata.mkdir(parents=True)
    for native in ('desktop-code', 'missing'):
        (metadata/(native+'.json')).write_text(json.dumps(dict(sessionId=native, cliSessionId=native, cwd='/tmp/project',
                                                            originCwd='/tmp/project', title='桌面 '+native, lastActivityAt=1700000000000)))
    before = {p: hashlib.sha256(p.read_bytes()).hexdigest() for directory in (transcripts, metadata) for p in directory.iterdir()}
    store = MultiStore(*roots)
    desktop = store.sessions(provider='claude:desktop')
    cli = store.sessions(provider='claude:local')
    assert desktop['total'] == cli['total'] == 3
    assert desktop['items'] == cli['items']
    assert any(row['id'] == 'claude:local:-tmp-project/cli-code' for row in cli['items'])
    sources = store.sources()['items']
    assert len(sources) == 6 and [s['label'] for s in sources if s['provider'] == 'claude'] == ['Claude Code']
    assert all(row['source_id'] == 'claude:local' and row['provider_label'] == 'Claude Code' for row in cli['items'])
    key = 'claude:desktop:account/org/desktop-code'
    assert store.trajectory(key)['provider_label'] == 'Claude Code'
    assert store.detail(key, 'M/a')['text'] == '完整回答'
    assert store.trajectory('claude:desktop:account/org/missing')['unavailable_reason']
    assert store.trajectory('claude:desktop:account/org/missing')['event_count'] == 0
    # Old shared-transcript links remain readable even after ownership changes.
    assert store.detail('claude:local:-tmp-project/desktop-code', 'M/u')['text'] == '完整用户原话'
    assert store.sessions(query='完整回答', provider='claude:local')['total'] == 2
    store.disabled = {'claude:local'}; store.catalogue_time = 0
    assert store.sessions(provider='claude:local')['total'] == 0
    try: store.detail(key, 'M/a')
    except ValueError: pass
    else: raise AssertionError('The unified switch must disable legacy desktop reads too')
    store.disabled = set()
    # Preserve old custom paths and disabled switches when adding new sources.
    settings = AppSettings(root/'state', roots)
    legacy = dict(paths={k: str(p) for k, p in zip(SOURCE_KEYS[:4], roots)},
                  enabled={k: k != 'claude:local' for k in SOURCE_KEYS[:4]}, syncSeconds=10, animations=False)
    settings.path.parent.mkdir(); settings.path.write_text(json.dumps(legacy))
    migrated = settings.read()
    assert migrated['paths']['claude:local'] == str(roots[1]) and not migrated['enabled']['claude:local']
    assert migrated['enabled']['dsh:local'] and migrated['paths']['claude:desktop'] == str(roots[4])
    assert settings.validate(migrated) == migrated
    assert migrated['syncSeconds'] == 10 and not migrated['animations']
    assert not migrated['enabled']['claude:desktop']
    # Existing separate path values survive; either old switch retains access.
    settings.path.write_text(json.dumps({**migrated, 'enabled': {**migrated['enabled'], 'claude:desktop': True}}))
    merged = settings.read()
    assert merged['enabled']['claude:local'] and merged['enabled']['claude:desktop']
    assert merged['paths'] == migrated['paths']
    assert {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in before} == before
    # Duplicate native IDs in different directories must not select an arbitrary file.
    other = roots[1]/'projects/other'; other.mkdir()
    (other/'desktop-code.jsonl').write_bytes((transcripts/'desktop-code.jsonl').read_bytes())
    assert store.adapters['claude:desktop'].detail('account/org/desktop-code', 'M/u')['text'] == '完整用户原话'
    metadata.joinpath('desktop-code.json').write_text(json.dumps(dict(sessionId='desktop-code', cliSessionId='desktop-code', cwd='/tmp/unrelated')))
    assert not store.adapters['claude:desktop'].discover()[0]['transcript_available']
    # Multiple index entries pointing at the same exact body do not duplicate it.
    metadata.joinpath('desktop-code.json').write_text(json.dumps(dict(sessionId='desktop-code', cliSessionId='desktop-code', cwd='/tmp/project')))
    metadata.joinpath('duplicate.json').write_bytes(metadata.joinpath('desktop-code.json').read_bytes())
    store.catalogue_time = 0
    combined = store.sessions(provider='claude:local')['items']
    assert len(combined) == 4  # Three distinct bodies and one index-only session.
    assert sum(r.get('transcript_key') == '-tmp-project/desktop-code' for r in combined) == 1

print('claude desktop self-test: ok (unified source, shared transcripts, old links, empty state, settings migration, portable paths, ambiguity, deduplication, read-only)')
