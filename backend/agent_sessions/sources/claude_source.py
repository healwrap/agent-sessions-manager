"""Compose the shared Claude transcript and optional desktop title index."""
import threading
from .claude import ClaudeDesktopStore


class ClaudeSourceStore:
    def __init__(self, root, index):
        self.desktop = ClaudeDesktopStore(index, root)
        self.shared = self.desktop.shared
        self.root = self.shared.root
        self.lock = threading.RLock()
        self.rows = {}

    def available(self):
        return self.desktop.available()

    def discover(self):
        with self.lock:
            seen = set(); desktop_rows = []
            for row in self.desktop.discover():
                transcript = row.get('transcript_key')
                if transcript and transcript in seen: continue
                if transcript: seen.add(transcript)
                desktop_rows.append(row)
            self.shared.desktop_keys = {r['transcript_key'] for r in desktop_rows if r['transcript_available']}
            rows = self.shared.discover()
            rows += [{**row, 'id': 'desktop/'+row['id'],
                      'route_id': 'claude:desktop', 'route_key': row['id']} for row in desktop_rows]
            parents = {row['transcript_key']: row['id'] for row in rows if row.get('transcript_key')}
            rows = [{**row, 'parent_id': parents.get(row['parent_id'], row['parent_id'])}
                    if row.get('parent_id') else row for row in rows]
            self.rows = {row['id']: row for row in rows}
            return rows

    def target(self, key):
        if key.startswith('desktop/'): return self.desktop, key.removeprefix('desktop/')
        return self.shared, key

    def trajectory(self, key, *args, **kwargs):
        adapter, native = self.target(key)
        return adapter.trajectory(native, *args, **kwargs)

    def revision(self, key):
        adapter, native = self.target(key)
        return adapter.revision(native)

    def session_activity(self, key):
        adapter, native = self.target(key)
        return adapter.session_activity(native)

    def detail(self, key, *args, **kwargs):
        adapter, native = self.target(key)
        return adapter.detail(native, *args, **kwargs)

    def focus(self, key, *args):
        adapter, native = self.target(key)
        return adapter.focus(native, *args)

    def matches_content(self, key, query):
        adapter, native = self.target(key)
        return adapter.matches_content(native, query)

    def attachment(self, key, *args):
        adapter, native = self.target(key)
        return adapter.attachment(native, *args)
