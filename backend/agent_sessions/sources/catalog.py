"""Aggregate provider catalogues under qualified session and source IDs."""
from __future__ import annotations
import os
import sqlite3
import time
from pathlib import Path
from .codex import Store
from .base import readonly_db
from .claude import ClaudeStore
from .antigravity import AntigravityStore

SOURCE_LABELS = {'codex:local': 'Codex', 'claude:local': 'Claude Code',
                 'antigravity:desktop': 'Antigravity', 'antigravity:cli': 'Antigravity CLI'}

class MultiStore:
    def __init__(self, codex, claude, antigravity, antigravity_cli):
        self.codex = Store(codex)
        self.adapters = {'codex:local': self.codex, 'claude:local': ClaudeStore(claude),
                         'antigravity:desktop': AntigravityStore(antigravity, 'desktop'),
                         'antigravity:cli': AntigravityStore(antigravity_cli, 'cli')}
        self.errors = {}; self.project_overrides = {}; self.disabled = set()
        self.catalogue_time = 0; self.catalogue_rows = []

    def sources(self):
        return {'items': [{'id': key, 'provider': key.split(':')[0], 'label': SOURCE_LABELS[key],
                           'instance': key.split(':')[1], 'enabled': key not in self.disabled, 'path': str(a.root), 'available': a.root.exists(),
                           'error': self.errors.get(key), 'independent_results': key.split(':')[0] != 'antigravity'}
                          for key, a in self.adapters.items()]}

    def catalogue(self):
        if time.monotonic()-self.catalogue_time < 3:
            return self.catalogue_rows
        items = []
        for source, adapter in self.adapters.items():
            if source in self.disabled: continue
            try:
                if source == 'codex:local':
                    first = adapter.sessions(limit=100)
                    rows = list(first['items']); next_offset = first['next_offset']
                    while next_offset is not None:
                        page = adapter.sessions(offset=next_offset, limit=100);rows.extend(page['items']);next_offset = page['next_offset']
                else:
                    with adapter.lock: rows = adapter.discover()
                self.errors.pop(source, None)
                for row in rows:
                    items.append({**row, 'id': source+':'+row['id'], 'native_id': row.get('native_id', row['id']),
                                  'provider': source.split(':')[0], 'provider_label': SOURCE_LABELS[source], 'source_id': source,
                                  'instance_id': source.split(':')[1]})
            except (OSError, ValueError, sqlite3.Error) as error:
                self.errors[source] = str(error)
        # Only merge a directory into a single explicit Codex project; ambiguous
        # roots remain independent until the user assigns a project in the UI.
        paths = {}
        for row in items:
            if row['provider'] == 'codex' and row['project_source'] == 'membership' and row['project_path']:
                paths.setdefault(str(Path(row['project_path']).resolve()), {})[row['project_id']] = row
        for row in items:
            candidates = paths.get(row.get('project_path'), {})
            if row['project_source'] == 'directory' and len(candidates) == 1:
                project = next(iter(candidates.values()))
                for field in ('project_id', 'project_label', 'project_path'): row[field] = project[field]
        self.catalogue_rows = sorted(items, key=lambda r: r['updated_at'], reverse=True)
        assignments = self.settings.read()['value'].get('projectAssignments', {}) if hasattr(self, 'settings') else {}
        for row in self.catalogue_rows:
            assigned = assignments.get(row['id'])
            if isinstance(assigned, dict) and all(isinstance(assigned.get(k), str) for k in ('project_id', 'project_label', 'project_path')):
                row.update({k: assigned[k] for k in ('project_id', 'project_label', 'project_path')})
                row['project_source'] = 'manual'
        self.project_overrides = {r['id']: {k: r[k] for k in ('project_id', 'project_label', 'project_path', 'project_source')} for r in self.catalogue_rows}
        self.catalogue_time = time.monotonic()
        return self.catalogue_rows

    def sessions(self, query='', offset=0, limit=30, project_id='', provider=''):
        rows = self.catalogue()
        selected = [r for r in rows if (not provider or r['provider'] == provider or r['source_id'] == provider) and
                    (not query or query.casefold() in (r['title']+' '+r['project_label']).casefold())]
        projects = {}
        for row in selected:
            group = projects.setdefault(row['project_id'], {k: row[k] for k in ('project_id', 'project_label', 'project_path', 'project_source')})
            group['count'] = group.get('count', 0)+1
        filtered = [r for r in selected if not project_id or r['project_id'] == project_id]
        current = os.environ.get('CODEX_THREAD_ID')
        return {'items': filtered[offset:offset+limit], 'total': len(filtered), 'projects': list(projects.values()),
                'next_offset': offset+limit if offset+limit < len(filtered) else None,
                'current_id': 'codex:local:'+current if current else None, 'sources': self.sources()['items']}

    def resolve(self, key):
        parts = key.split(':', 2)
        if ':'.join(parts[:2]) in self.disabled: raise ValueError('此会话来源已停用，请在设置中启用')
        if len(parts) == 3 and ':'.join(parts[:2]) in self.adapters:
            return ':'.join(parts[:2]), parts[2]
        # Preserve old Codex links and view settings.
        if 'codex:local' in self.disabled: raise ValueError('Codex 来源已停用，请在设置中启用')
        return 'codex:local', key

    def trajectory(self, key, *args, **kwargs):
        source, native = self.resolve(key)
        data = self.adapters[source].trajectory(native, *args, **kwargs)
        qualified = source+':'+native
        if qualified not in self.project_overrides: self.catalogue()
        row = self.adapters[source].rows.get(native, {}) if source.startswith('antigravity:') else {}
        return {**data, 'id': qualified, 'provider': source.split(':')[0], 'provider_label': SOURCE_LABELS[source], 'source_id': source,
                'instance_id': source.split(':')[1], **self.project_overrides.get(qualified, {}),
                'unavailable_reason': '此会话只有摘要记录，本机尚未保存可读取的对话轨迹。' if row.get('transcript_available') is False else None,
                'capabilities': {'independent_results': source.split(':')[0] != 'antigravity'}}

    def detail(self, key, *args, **kwargs):
        source, native = self.resolve(key)
        result = self.adapters[source].detail(native, *args, **kwargs)
        return {**result, 'provider': source.split(':')[0], 'provider_label': SOURCE_LABELS[source], 'source_id': source,
                'instance_id': source.split(':')[1]}

    def focus(self, key, *args):
        source, native = self.resolve(key)
        return self.adapters[source].focus(native, *args)
