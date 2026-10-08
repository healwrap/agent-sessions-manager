"""Durable Harness lineage, descriptors and direct-child catalogues."""
import json
from collections import defaultdict
from pathlib import PurePosixPath


def family_facts(adapter, key, path, header, stream):
    stat = path.stat()
    version = (str(path), stat.st_size, stat.st_mtime_ns)
    old = adapter.family_cache.get(key)
    if old and old[0] == version: return old[1]
    facts = {'label': '', 'children': {}, 'members': {}}
    own = not header.get('isSeeded', False)
    markers = (b'"subagent/descriptor"', b'"subagent/catalog"', b'"team/member"', b'"session/end-seed"')
    with stream(path) as handle:
        for line in handle:
            if not line.endswith(b'\n') or not any(marker in line for marker in markers): continue
            try: row = json.loads(line)
            except ValueError: continue
            kind, data = row.get('type'), row.get('data') or {}
            if not isinstance(data, dict): continue
            if kind == 'session/end-seed' and data.get('inherited') is True: own = True
            if not own: continue
            if kind == 'subagent/descriptor':
                # A fork may carry an ancestor descriptor. The child's own
                # descriptor follows the seed boundary and owns its label.
                facts['label'] = data.get('label') if isinstance(data.get('label'), str) else ''
            elif kind == 'subagent/catalog' and isinstance(data.get('childId'), str) and data['childId']:
                facts['children'][data['childId']] = data
            elif kind == 'team/member':
                member = data.get('member')
                if isinstance(member, dict) and isinstance(member.get('id'), str) and member['id']:
                    facts['members'][member['id']] = member
    after = path.stat()
    if (after.st_size, after.st_mtime_ns) != version[1:]: raise OSError('DSH 会话正在更新，请稍后重试')
    adapter.family_cache[key] = (version, facts)
    return facts


def link_family(rows, headers, facts):
    identities = defaultdict(list)
    for key, row in rows.items(): identities[row['native_id']].append(key)

    def resolve(native, relative):
        local = str(PurePosixPath(relative).parent/native)
        if local in rows and rows[local]['native_id'] == native: return local
        matches = identities.get(native, [])
        return matches[0] if len(matches) == 1 else local

    for key, row in list(rows.items()):
        header = headers.get(key, {})
        if header.get('origin') != 'subagent': continue
        row['session_kind'] = 'subagent'
        parent = header.get('parentSession')
        if isinstance(parent, str) and parent and parent != row['native_id']:
            row['parent_id'] = resolve(parent, key)
        label = facts.get(key, {}).get('label')
        if label: row.update(agent_name=label, title=label if row['title'] == row['native_id'] else row['title'])

    for parent, family in facts.items():
        entries = {native: {'label': member.get('description')} for native, member in family['members'].items()}
        entries.update(family['children'])
        for native, entry in entries.items():
            key = resolve(native, parent)
            if key == parent: continue
            child = rows.get(key)
            if child is None:
                child = rows[key] = {**rows[parent], 'id': key, 'native_id': native,
                                     'title': entry.get('label') or native, 'transcript_available': False,
                                     'unavailable_reason': '父会话记录了此子代理，本机没有保存其独立日志。'}
                for field in ('parent_id', 'agent_name', 'agent_role'): child.pop(field, None)
                child.update(session_kind='subagent', parent_id=parent)
            # Copied catalogues must not override an immutable child header.
            if child.get('session_kind') != 'subagent' or child.get('parent_id') != parent: continue
            if isinstance(entry.get('label'), str) and entry['label']:
                child.setdefault('agent_name', entry['label'])
            member = family['members'].get(native, {})
            if isinstance(member.get('name'), str) and member['name']: child['agent_name'] = member['name']
            if isinstance(member.get('description'), str) and member['description']: child['agent_role'] = member['description']
