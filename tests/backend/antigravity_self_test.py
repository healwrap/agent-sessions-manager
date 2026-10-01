"""Verified tool-result association without guessing from adjacency alone."""
import hashlib
import json
import tempfile
from pathlib import Path
from agent_sessions.sources.catalog import MultiStore


def main():
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        query = 'github "display" token=exact'
        result = f'Created At: 2026-09-30T23:04:04+08:00\nCompleted At: 2026-09-30T23:04:08+08:00\nThe search for "{query}" returned the following summary:\nORIGINAL token=exact'
        rows = [
            {'step_index': 0, 'type': 'USER_INPUT', 'content': '<USER_REQUEST>原话</USER_REQUEST>'},
            {'step_index': 1, 'type': 'PLANNER_RESPONSE', 'tool_calls': [{'name': 'search_web', 'args': {'query': query}}]},
            {'step_index': 2, 'type': 'GENERIC', 'content': result},
            {'step_index': 3, 'type': 'PLANNER_RESPONSE', 'tool_calls': [{'name': 'search_web', 'args': {'query': 'different'}}]},
            {'step_index': 4, 'type': 'GENERIC', 'content': result},
            {'step_index': 5, 'type': 'PLANNER_RESPONSE', 'tool_calls': [{'name': 'search_web', 'args': {'query': query}}]},
            {'step_index': 6, 'type': 'GENERIC', 'content': 'Created At: 2026-09-30T23:04:04+08:00\nCompleted At: 2026-09-30T23:04:08+08:00\nEncountered error in step execution: 503 Service Unavailable'},
            {'step_index': 7, 'type': 'PLANNER_RESPONSE', 'tool_calls': [{'name': 'search_web', 'args': {'query': query}}, {'name': 'search_web', 'args': {'query': query}}]},
            {'step_index': 8, 'type': 'GENERIC', 'content': result},
            {'step_index': 9, 'type': 'PLANNER_RESPONSE', 'tool_calls': [{'id': 'native-id', 'name': 'run', 'args': {'command': 'second'}}]},
            {'step_index': 10, 'type': 'GENERIC', 'tool_call_id': 'native-id', 'content': 'NATIVE ORIGINAL'},
        ]
        paths = []
        for source in ['desktop', 'cli']:
            path = root/source/'brain/same/.system_generated/logs/transcript_full.jsonl'
            path.parent.mkdir(parents=True)
            path.write_text(''.join(json.dumps(row, ensure_ascii=False)+'\n' for row in rows))
            paths.append(path)
        before = [hashlib.sha256(path.read_bytes()).digest() for path in paths]
        store = MultiStore(root/'codex', root/'claude', root/'desktop', root/'cli')
        key = 'antigravity:desktop:same'
        data = store.trajectory(key)
        calls = {e['ref']: e for e in data['events'] if e['kind'] == 'tool'}
        assert calls['S/1/C/0']['status'] == 'completed'
        assert calls['S/1/C/0']['duration_ms'] == 4000
        assert store.detail(key, 'S/1/C/0', part='output')['text'] == result
        alias = store.detail(key, 'S/2')
        assert alias['parent_ref'] == 'S/1/C/0' and alias['text'] == result
        assert calls['S/3/C/0']['status'] == 'unmatched'
        assert calls['S/5/C/0']['status'] == 'unmatched'
        assert calls['S/7/C/0']['status'] == 'unmatched'
        assert calls['S/7/C/1']['status'] == 'unmatched'
        assert any(e['ref'] == 'S/6' and e['status'] == 'error' for e in data['events'])
        assert store.detail(key, 'S/9/C/0', part='output')['text'] == 'NATIVE ORIGINAL'
        assert store.sessions(provider='antigravity:desktop')['total'] == 1
        assert store.sessions(provider='antigravity:cli')['total'] == 1
        assert store.sessions(provider='antigravity')['total'] == 2
        assert store.trajectory('antigravity:cli:same')['provider_label'] == 'Antigravity CLI'
        assert [hashlib.sha256(path.read_bytes()).digest() for path in paths] == before
    print('antigravity self-test: ok (query, native IDs, old refs, ambiguity, source isolation, exact bytes)')


if __name__ == '__main__':
    main()
