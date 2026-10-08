"""Public parent/child links independent of native source formats."""
from collections import Counter


def qualify_sessions(registry, source, rows):
    identities = {row['id']: registry.qualify(source, row) for row in rows}
    items = []
    for row in rows:
        public = {key: value for key, value in row.items() if key not in ('route_id', 'route_key')}
        parent = row.get('parent_id')
        if parent:
            public.update(native_parent_id=parent, parent_id=identities.get(parent, source+':'+parent))
        items.append({**public, 'id': identities[row['id']],
                      'session_kind': row.get('session_kind', 'main'),
                      'native_id': row.get('native_id', row['id']),
                      'provider': source.split(':')[0],
                      'provider_label': registry.plugins[source].label,
                      'source_id': source, 'instance_id': source.split(':')[1]})
    return items


def annotate_family(rows):
    readable = {row['id'] for row in rows if row.get('transcript_available') is not False}
    counts = Counter(row.get('parent_id') for row in rows if row.get('parent_id') != row['id'])
    for row in rows:
        row['parent_available'] = row.get('parent_id') in readable and row.get('parent_id') != row['id']
        row['children_count'] = counts[row['id']]


def session_family(store, key, offset=0, limit=30, include_activity=True):
    source, native = store.resolve(key)
    rows = store.catalogue()
    current = next((row for row in rows if row['source_id'] == source
                    and store.resolve(row['id'])[1] == native), None)
    if current is None: raise FileNotFoundError('未找到本地会话')
    def activity(row):
        if not include_activity: return {}
        child_source, child_key = store.resolve(row['id'])
        read = getattr(store.adapters[child_source], 'session_activity', None)
        return read(child_key) if callable(read) else {}
    return family_page(current, rows, activity, offset, limit)


def family_page(current, rows, activity, offset=0, limit=30):
    parent = next((row for row in rows if row['id'] == current.get('parent_id') and row['id'] != current['id']), None)
    children = [row for row in rows if row.get('parent_id') == current['id'] and row['id'] != current['id']]
    items = []
    for row in children[offset:offset+limit]:
        summary = {'status': 'unknown', 'result_preview': '', 'result_ref': None}
        error = None
        try:
            summary.update(activity(row))
        except (OSError, ValueError) as exc:
            error = str(exc)
        items.append({**row, **summary, 'activity_error': error})
    return {'current': current, 'parent': parent, 'items': items, 'total': len(children),
            'next_offset': offset+limit if offset+limit < len(children) else None}
