"""Aggregate registered source plugins without native-format knowledge."""
from __future__ import annotations
import os
import sqlite3
import threading
import time
from pathlib import Path
from .contract import SourceRegistry
from .plugins import PLUGINS, SOURCE_KEYS, path_fields
from .common import normalize_event
from .terminal import terminal_input
from .session_family import qualify_sessions, annotate_family, session_family


def public_source(source):
    return next((p.id for p in PLUGINS if source in p.aliases), source)


class MultiStore:
    def __init__(self, codex=None, claude=None, antigravity=None, antigravity_cli=None,
                 claude_desktop=None, dsh=None, cursor=None, *, paths=None, plugins=PLUGINS):
        if paths is None:
            roots = (codex, claude, antigravity, antigravity_cli, claude_desktop, dsh, cursor)
            defaults = path_fields()
            paths = {key: Path(root) if root is not None else defaults[key].default()
                     for key, root in zip(SOURCE_KEYS, roots)}
        self.paths = {key: Path(path) for key, path in paths.items()}
        self.registry = SourceRegistry(plugins, self.paths)
        self.adapters = self.registry.adapters
        self.codex = self.adapters.get('codex:local')
        self.errors = {}; self.project_overrides = {}; self.disabled = set()
        self.catalogue_time = 0; self.catalogue_rows = []
        self.lock = threading.RLock()

    def sources(self):
        items = []
        for key, plugin in self.registry.plugins.items():
            adapter = self.adapters[key]
            items.append({'id': key, 'provider': key.split(':')[0], 'label': plugin.label,
                          'instance': key.split(':')[1], 'enabled': key not in self.disabled,
                          'path': str(adapter.root), 'available': adapter.available(),
                          'error': self.errors.get(key), 'api_version': plugin.api_version,
                          'aliases': list(plugin.aliases),
                          'capabilities': plugin.capabilities,
                          'paths': [{'key': f.key, 'label': f.label, 'hint': f.hint} for f in plugin.paths]})
        return {'items': items}

    def catalogue(self):
        with self.lock:
            return self._catalogue()

    def _catalogue(self):
        if self.catalogue_time and time.monotonic()-self.catalogue_time < 3:
            return self.catalogue_rows
        items = []
        for source, adapter in self.adapters.items():
            if source in self.disabled: continue
            try:
                with adapter.lock: rows = adapter.discover()
                self.errors.pop(source, None)
                items.extend(qualify_sessions(self.registry, source, rows))
            except (OSError, ValueError, sqlite3.Error) as error:
                self.errors[source] = str(error)
        # Project identity belongs to the source, never to a neighbouring adapter.
        self.catalogue_rows = sorted(items, key=lambda r: r['updated_at'], reverse=True)
        annotate_family(self.catalogue_rows)
        assignments = self.settings.read()['value'].get('projectAssignments', {}) if hasattr(self, 'settings') else {}
        for row in self.catalogue_rows:
            assigned = assignments.get(row['id'])
            if isinstance(assigned, dict) and all(isinstance(assigned.get(k), str) for k in ('project_id', 'project_label', 'project_path')):
                row.update({k: assigned[k] for k in ('project_id', 'project_label', 'project_path')})
                row['project_source'] = 'manual'
        self.project_overrides = {r['id']: {k: r[k] for k in ('project_id', 'project_label', 'project_path', 'project_source')} for r in self.catalogue_rows}
        self.catalogue_time = time.monotonic()
        return self.catalogue_rows

    def session_family(self, key, offset=0, limit=30, include_activity=True):
        return session_family(self, key, offset, limit, include_activity)

    def sessions(self, query='', offset=0, limit=30, project_id='', provider='', search_mode='words', include_subagents=True):
        from agent_sessions.search.catalogue import search_sessions
        provider = self.registry.public_source(provider)
        rows = self.catalogue()
        selected, progress = search_sessions(self, rows, query, search_mode, provider, include_subagents)
        projects = {}
        for row in selected:
            group = projects.setdefault(row['project_id'], {k: row[k] for k in ('project_id', 'project_label', 'project_path', 'project_source')})
            group['count'] = group.get('count', 0)+1
        filtered = [r for r in selected if not project_id or r['project_id'] == project_id]
        current = os.environ.get('CODEX_THREAD_ID')
        return {'items': filtered[offset:offset+limit], 'total': len(filtered), 'projects': list(projects.values()),
                'next_offset': offset+limit if offset+limit < len(filtered) else None,
                'current_id': 'codex:local:'+current if current else None, 'sources': self.sources()['items'], 'search_index': progress}

    def resolve(self, key):
        parts = key.split(':', 2)
        route = ':'.join(parts[:2])
        source = self.registry.public_source(route)
        if source in self.disabled: raise ValueError('此会话来源已停用，请在设置中启用')
        if len(parts) == 3 and route in self.registry.routes:
            return self.registry.resolve(route, parts[2])
        # Preserve old unqualified Codex links at the routing boundary only.
        if 'codex:local' in self.disabled: raise ValueError('Codex 来源已停用，请在设置中启用')
        return 'codex:local', key

    def identity(self, source):
        return {'provider': source.split(':')[0], 'provider_label': self.registry.plugins[source].label,
                'source_id': source, 'instance_id': source.split(':')[1]}

    def trajectory(self, key, *args, **kwargs):
        source, native = self.resolve(key)
        data = self.adapters[source].trajectory(native, *args, **kwargs)
        parts = key.split(':', 2)
        qualified = key if len(parts) == 3 and ':'.join(parts[:2]) in self.registry.routes else source+':'+native
        if qualified not in self.project_overrides: self.catalogue()
        row = getattr(self.adapters[source], 'rows', {}).get(native, {})
        session = next((item for item in self.catalogue_rows if item['id'] == qualified), None)
        return {**data, 'id': qualified, **self.identity(source), **self.project_overrides.get(qualified, {}),
                'session': session,
                'unavailable_reason': row.get('unavailable_reason') or ('此会话只有摘要或索引记录，本机尚未保存可读取的对话轨迹。' if row.get('transcript_available') is False else None),
                'capabilities': self.registry.plugins[source].capabilities}

    def revision(self, key):
        source, native = self.resolve(key)
        return self.adapters[source].revision(native)

    def detail(self, key, *args, **kwargs):
        source, native = self.resolve(key)
        result = self.adapters[source].detail(native, *args, **kwargs)
        normalize_event(result['event'])
        for event in result.get('nested', []):
            if 'kind' in event: normalize_event(event)
        cwd = self.adapters[source].rows.get(native, {}).get('cwd', '')
        terminal = terminal_input(result, cwd)
        if terminal: result = {**result, 'terminal': terminal}
        return {**result, 'cwd': cwd, **self.identity(source), 'capabilities': self.registry.plugins[source].capabilities}

    def focus(self, key, *args):
        source, native = self.resolve(key)
        return self.adapters[source].focus(native, *args)

    def attachment(self, key, *args):
        source, native = self.resolve(key)
        return self.adapters[source].attachment(native, *args)
