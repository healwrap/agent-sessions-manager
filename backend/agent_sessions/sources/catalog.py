"""Aggregate provider catalogues under qualified session and source IDs."""
from __future__ import annotations
import os
import sqlite3
import time
from .codex import Store
from .base import readonly_db
from .claude import ClaudeStore, ClaudeDesktopStore
from .antigravity import AntigravityStore
from .dsh import DshStore

SOURCE_LABELS = {'codex:local': 'Codex', 'claude:local': 'Claude Code CLI',
                 'antigravity:desktop': 'Antigravity', 'antigravity:cli': 'Antigravity CLI',
                 'claude:desktop': 'Claude Code Desktop', 'dsh:local': 'DeepSeek Harness'}

class MultiStore:
    def __init__(self, codex, claude, antigravity, antigravity_cli, claude_desktop=None, dsh=None):
        self.codex = Store(codex)
        self.adapters = {'codex:local': self.codex, 'claude:local': ClaudeStore(claude),
                         'antigravity:desktop': AntigravityStore(antigravity, 'desktop'),
                         'antigravity:cli': AntigravityStore(antigravity_cli, 'cli'),
                         'claude:desktop': ClaudeDesktopStore(claude_desktop or claude.parent/'claude-desktop', claude),
                         'dsh:local': DshStore(dsh or codex.parent/'dsh')}
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
        desktop_rows = []
        if 'claude:desktop' not in self.disabled:
            try:
                desktop = self.adapters['claude:desktop']
                with desktop.lock: desktop_rows = desktop.discover()
                self.errors.pop('claude:desktop', None)
            except (OSError, ValueError) as error:
                self.errors['claude:desktop'] = str(error)
        self.adapters['claude:local'].desktop_ids = {r['native_id'] for r in desktop_rows if r['transcript_available']}
        for source, adapter in self.adapters.items():
            if source in self.disabled: continue
            try:
                if source == 'codex:local':
                    first = adapter.sessions(limit=100)
                    rows = list(first['items']); next_offset = first['next_offset']
                    while next_offset is not None:
                        page = adapter.sessions(offset=next_offset, limit=100);rows.extend(page['items']);next_offset = page['next_offset']
                elif source == 'claude:desktop':
                    rows = desktop_rows
                else:
                    with adapter.lock: rows = adapter.discover()
                if source != 'claude:desktop': self.errors.pop(source, None)
                for row in rows:
                    items.append({**row, 'id': source+':'+row['id'], 'native_id': row.get('native_id', row['id']),
                                  'provider': source.split(':')[0], 'provider_label': SOURCE_LABELS[source], 'source_id': source,
                                  'instance_id': source.split(':')[1]})
            except (OSError, ValueError, sqlite3.Error) as error:
                self.errors[source] = str(error)
        # Each adapter owns its project identity and label. A shared directory
        # does not authorize borrowing a different Agent's named project.
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
        aliases = self.settings.read()['value'].get('aliases', {}) if hasattr(self, 'settings') else {}
        selected = []
        for row in rows:
            if provider and row['provider'] != provider and row['source_id'] != provider: continue
            if query and query.casefold() not in (row['title']+' '+row['project_label']+' '+aliases.get(row['id'], '')).casefold():
                try:
                    if not self.adapters[row['source_id']].matches_content(row['id'].split(':', 2)[2], query): continue
                except (OSError, ValueError):
                    continue
            selected.append({**row, 'search_query': query} if query else row)
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
        row = getattr(self.adapters[source], 'rows', {}).get(native, {})
        return {**data, 'id': qualified, 'provider': source.split(':')[0], 'provider_label': SOURCE_LABELS[source], 'source_id': source,
                'instance_id': source.split(':')[1], **self.project_overrides.get(qualified, {}),
                'unavailable_reason': row.get('unavailable_reason') or ('此会话只有摘要或索引记录，本机尚未保存可读取的对话轨迹。' if row.get('transcript_available') is False else None),
                'capabilities': {'independent_results': source.split(':')[0] != 'antigravity'}}

    def detail(self, key, *args, **kwargs):
        source, native = self.resolve(key)
        result = self.adapters[source].detail(native, *args, **kwargs)
        return {**result, 'provider': source.split(':')[0], 'provider_label': SOURCE_LABELS[source], 'source_id': source,
                'instance_id': source.split(':')[1]}

    def focus(self, key, *args):
        source, native = self.resolve(key)
        return self.adapters[source].focus(native, *args)
