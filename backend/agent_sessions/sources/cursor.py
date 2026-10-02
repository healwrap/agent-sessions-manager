"""Read Cursor Agent/Composer histories directly without exporting or rewriting."""
from .base import HistoryStore
from .codex import PAGE_CHARS
from .cursor_events import events
from .cursor_storage import body, catalogue, conversation, database, fingerprint, workspace


class CursorStore(HistoryStore):
    def __init__(self, root):
        super().__init__(root, 'cursor', 'desktop')
        self.catalogue_version = None

    def databases(self):
        user = self.root/'User' if (self.root/'User').is_dir() else self.root
        return [p for p in [user/'globalStorage/state.vscdb', *sorted((user/'workspaceStorage').glob('*/state.vscdb'))] if p.is_file()]

    def discover(self):
        paths = self.databases()
        version = fingerprint(paths+[p.with_name('workspace.json') for p in paths])
        if version == self.catalogue_version: return [self.public_row(row) for row in self.rows.values()]
        rows = {}
        for path in paths:
            fallback = workspace(path.with_name('workspace.json'))
            for row in catalogue(path, fallback):
                key = row['id']
                old = rows.get(key)
                # Global storage is authoritative after Cursor migrates bodies.
                # Prefer a readable copy if the global index has no local body.
                if old and (old['transcript_available'] or not row['transcript_available']): continue
                rows[key] = row
        self.files = {key: row['_source'] for key, row in rows.items()}
        self.rows = {key: {**row, **self.project(key, row['cwd'])} for key, row in rows.items()}
        self.catalogue_version = version
        self.loaded = {key: value for key, value in self.loaded.items() if key in self.rows}
        return [self.public_row(row) for row in self.rows.values()]

    @staticmethod
    def public_row(row):
        return {k: row[k] for k in ('id', 'native_id', 'title', 'cwd', 'updated_at', 'transcript_available', 'project_id', 'project_label', 'project_path', 'project_source') if k in row}

    def session(self, key):
        with self.lock:
            self.discover()
            if key not in self.rows: raise FileNotFoundError('没有找到此 Cursor 会话')
            row = self.rows[key]
            path = row['_source']
            version = fingerprint([path])
            cached = self.loaded.get(key)
            if cached and cached['index']['source_mtime_ns'] == version: return cached
            with database(path) as db:
                status, locations, warnings = conversation(db, row['_table'], key)
                visible, lookup, turns, warnings = events(db, row['_table'], status, locations, warnings)
            if not visible:
                row['transcript_available'] = False
                row['unavailable_reason'] = '此 Cursor 会话只有索引，或本地消息已缺失，当前没有可读取的对话。'
            else:
                row.pop('unavailable_reason', None)
            data = {'source': path, 'events': visible, 'lookup': lookup, 'turns': turns,
                    'index': {'meta': {'title': row['title'], 'cwd': row['cwd'], 'unrecognized_record_types': warnings},
                              'source_size': path.stat().st_size, 'source_mtime_ns': version}}
            # A few open histories may be cached; never retain all search bodies.
            if len(self.loaded) >= 4: self.loaded.pop(next(iter(self.loaded)))
            self.loaded[key] = data
            return data

    def matches_content(self, key, query):
        with self.lock:
            self.discover()
            if key not in self.rows: return False
            version = (fingerprint([self.files[key]]), query.casefold())
            old = self.search_matches.get(key)
            if old and old[0] == version: return old[1]
            data = self.session(key)
            result = any(query.casefold() in record['text'].casefold() for category, record in data['lookup'].values() if category == 'message')
            self.search_matches[key] = version, result
            self.loaded.pop(key, None)
            return result

    def detail(self, key, ref, page=1, part='input'):
        with self.lock:
            data = self.session(key)
            if ref not in data['lookup']: raise FileNotFoundError('此 Cursor 消息或调用不存在')
            record = data['lookup'][ref][1]
            output = record['output_available']
            row = self.rows[key]
            if part == 'output' and not output: text = ''
            else:
                with database(data['source']) as db: text = body(db, row['_table'], record, part)
            pages = max(1, (len(text)+PAGE_CHARS-1)//PAGE_CHARS)
            if page < 1 or page > pages: raise ValueError('页码超过内容长度')
            return {'event': next(e for e in data['events'] if e['ref'] == ref),
                    'text': text[(page-1)*PAGE_CHARS:page*PAGE_CHARS], 'page': page, 'pages': pages,
                    'total_chars': len(text), 'part': part, 'output_available': output,
                    'source': str(data['source']), 'line': None, 'source_key': record['key'],
                    'thread_id': key, 'nested': [], 'shared_output': False, 'parent_ref': None,
                    'input_truncated': False, 'parent_output_available': False}
