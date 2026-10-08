"""Discover Cursor subagent bodies omitted from the ordinary composer headers."""
from collections import defaultdict
from .cursor_storage import decode, fields


def family_headers(db, table, headers, keys):
    bodies = {}
    parents = defaultdict(set)
    names = ('name', 'createdAt', 'lastUpdatedAt', 'workspaceIdentifier', 'isDraft',
             'subagentInfo', 'subagentComposerIds', 'isBestOfNSubcomposer')
    for key in sorted(keys):
        record = fields(db, table, 'composerData:'+key, tuple('$.'+name for name in names))
        if not record: continue
        body = dict(zip(names, record), composerId=key)
        for field, default in (('workspaceIdentifier', {}), ('subagentInfo', {}), ('subagentComposerIds', [])):
            body[field] = decode(body[field], default)
        bodies[key] = body
        children = body['subagentComposerIds']
        if isinstance(children, list):
            for child in children:
                if isinstance(child, str) and child and child != key: parents[child].add(key)
    rows = {h['composerId']: dict(h) for h in headers}
    needed = set(rows)
    for key, body in bodies.items():
        info = body['subagentInfo']
        if isinstance(info, dict) and info and not body['isBestOfNSubcomposer']:
            needed.add(key)
            parent = info.get('parentComposerId')
            if isinstance(parent, str) and parent in bodies: needed.add(parent)
    needed.update(parents)
    for key in sorted(needed):
        body = bodies.get(key, {})
        row = rows.setdefault(key, dict(body, composerId=key))
        # Keep indexed title/workspace identity; restore absent child metadata
        # from its authoritative body, including nested subagents.
        for name in names:
            if name in body and (name.startswith('subagent') or name not in row or name != 'isDraft' and not row[name]):
                row[name] = body[name]
        info = row.get('subagentInfo') or {}
        if not isinstance(info, dict) or row.get('isBestOfNSubcomposer'): continue
        parent = info.get('parentComposerId')
        if not isinstance(parent, str) or not parent:
            candidates = parents.get(key, set())
            parent = next(iter(candidates)) if len(candidates) == 1 else None
        if not info and key not in parents: continue
        row['session_kind'] = 'subagent'
        if parent and parent != key: row['parent_id'] = parent
        role = info.get('subagentTypeName')
        if isinstance(role, str) and role: row['agent_role'] = role
        if isinstance(row.get('name'), str) and row['name']: row['agent_name'] = row['name']
        elif role: row['name'] = role
    return list(rows.values())
