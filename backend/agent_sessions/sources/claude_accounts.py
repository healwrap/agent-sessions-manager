"""Read Claude Code histories from the default directory and managed App profiles."""
import json
from pathlib import Path
from agent_sessions.profile_ownership import directory
from .claude_source import ClaudeSourceStore


class ClaudeAccountsStore(ClaudeSourceStore):
    def __init__(self, root, index, state_home=None):
        super().__init__(root, index)
        self.state_home = Path(state_home) if state_home is not None else None
        self.profiles = {}

    def profile_sources(self):
        if self.state_home is None: return []
        path = self.state_home/'environments.json'
        settings = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
        accounts = {row['app_profile_id']: row for row in settings.get('accounts', [])
                    if row.get('provider') == 'claude' and row.get('app_profile_id')}
        owners = settings.get('profile_owners', {}).get('app_profiles', {})
        sources = []
        for profile in settings.get('app_profiles', []):
            key = profile['id']
            root = directory(self.state_home, 'app_profiles', key)
            account = accounts.get(key)
            owner = owners.get(key, {})
            metadata = {'environment_id': key, 'environment_name': profile['name'],
                        'account_id': account['id'] if account else owner.get('account_id', ''),
                        'account_name': account['name'] if account else owner.get('account_name', '')}
            if key not in self.profiles:
                self.profiles[key] = ClaudeSourceStore(root/'claude-code', root/'claude-code-sessions')
            sources.append((key, self.profiles[key], metadata))
        self.profiles = {key: adapter for key, adapter, _ in sources}
        return sources

    def available(self):
        with self.lock:
            return super().available() or any(adapter.available() for _, adapter, _ in self.profile_sources())

    def discover(self):
        with self.lock:
            rows = super().discover()
            seen = {self.root}
            for profile, adapter, metadata in self.profile_sources():
                # An explicitly configured profile directory keeps its existing IDs.
                if adapter.root in seen:
                    if adapter.root == self.root:
                        rows = [{**row, **metadata} for row in rows]
                    continue
                seen.add(adapter.root)
                prefix = 'profile/'+profile+'/'
                for original in adapter.discover():
                    row = {key: value for key, value in original.items() if key not in ('route_id', 'route_key')}
                    row.update(id=prefix+row['id'], **metadata)
                    if row.get('parent_id'): row['parent_id'] = prefix+row['parent_id']
                    rows.append(row)
            self.rows = {row['id']: row for row in rows}
            return rows

    def target(self, key):
        if not key.startswith('profile/'): return super().target(key)
        with self.lock:
            _, profile, native = key.split('/', 2)
            self.profile_sources()
            if profile not in self.profiles:
                raise FileNotFoundError('此 Claude App 环境已移除')
            return self.profiles[profile], native
