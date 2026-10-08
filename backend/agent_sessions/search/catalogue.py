"""Search orchestration over the standard source interface."""
from agent_sessions.paths import state_root
from .index import SearchIndex
from .query import terms, matches


def search_sessions(store, rows, query, mode, provider, include_subagents=True):
    needles = terms(query, mode)
    aliases = store.settings.read()['value'].get('aliases', {}) if hasattr(store, 'settings') else {}
    with store.lock:
        if not hasattr(store, 'search_index'):
            directory = store.settings.path.parent if hasattr(store, 'settings') else state_root()
            store.search_index = SearchIndex(directory)
        index = store.search_index
    index.sync(rows, store.adapters, store.resolve, aliases, (store.catalogue_time, tuple(sorted(aliases.items()))))
    eligible = [row for row in rows
                if (include_subagents or row.get('session_kind') != 'subagent')
                and (not provider or row['provider'] == provider or row['source_id'] == provider)]
    if not needles:
        return eligible, None
    ids = {row['id'] for row in eligible}
    found, progress = index.find(needles, ids)
    selected = []
    for row in eligible:
        label = ' '.join(str(row.get(k) or '') for k in ('title', 'project_label', 'agent_name', 'agent_role'))+' '+aliases.get(row['id'], '')
        # Titles remain immediately searchable during initial content indexing.
        hit = row['id'] in found or matches(label, needles)
        source, native = store.resolve(row['id'])
        if not hit and not callable(getattr(store.adapters[source], 'search_document', None)):
            hit = all(term in label.casefold() or store.adapters[source].matches_content(native, term) for term in needles)
        if hit: selected.append({**row, 'search_query': query, 'search_mode': mode})
    return selected, progress
