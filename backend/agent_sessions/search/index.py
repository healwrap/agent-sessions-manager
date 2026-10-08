"""Persistent SQLite substring index; native history parsing stays in sources."""
import json
import sqlite3
import threading
from collections import OrderedDict


class SearchIndex:
    def __init__(self, directory):
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = directory/'search-v1.sqlite3'
        self.db = sqlite3.connect(self.path, check_same_thread=False)
        self.path.chmod(0o600)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, identity TEXT, version TEXT, label TEXT, error TEXT)')
        try:
            self.db.execute("CREATE VIRTUAL TABLE IF NOT EXISTS search_text USING fts5(id UNINDEXED, label, text, tokenize='trigram')")
        except sqlite3.OperationalError:
            self.db.execute('CREATE TABLE IF NOT EXISTS search_text(id TEXT PRIMARY KEY, label TEXT, text TEXT)')
        sql = self.db.execute("SELECT sql FROM sqlite_master WHERE name='search_text'").fetchone()[0]
        self.fts = 'USING fts5' in sql
        self.db.commit()
        self.lock = threading.RLock()
        self.jobs = OrderedDict()
        self.desired = {}
        self.worker = None
        self.active = {}
        self.stopped = False
        self.closed = False
        self.stamp = None
        self.generation = 0
        self.cache = OrderedDict()

    def sync(self, rows, adapters, resolve, aliases, stamp):
        with self.lock:
            if self.stopped or stamp == self.stamp: return
        wanted = {}
        for row in rows:
            source, native = resolve(row['id'])
            adapter = adapters[source]
            label = ' '.join(str(row.get(k) or '') for k in ('title', 'project_label', 'agent_name', 'agent_role'))+' '+aliases.get(row['id'], '')
            identity = source+':'+str(adapter.root)
            try: version = json.dumps(adapter.revision(native), sort_keys=True)
            except (OSError, ValueError): version = json.dumps(row.get('updated_at'))
            wanted[row['id']] = (identity, version, label, adapter, native)
        with self.lock:
            if self.stopped: return
            existing = {row[0]: row[1:] for row in self.db.execute('SELECT id,identity,version,label,error FROM documents')}
            for key in existing.keys()-wanted.keys():
                self.db.execute('DELETE FROM search_text WHERE id=?', (key,))
                self.db.execute('DELETE FROM documents WHERE id=?', (key,))
            for key, job in wanted.items():
                identity, version, label, adapter, native = job
                old = existing.get(key)
                if not old or old[0] != identity:
                    self.db.execute('DELETE FROM search_text WHERE id=?', (key,))
                    self.db.execute('INSERT OR REPLACE INTO documents VALUES(?,?,?,?,NULL)', (key, identity, '', label))
                    self.db.execute('INSERT INTO search_text VALUES(?,?,?)', (key, label.casefold(), ''))
                elif old[2] != label:
                    self.db.execute('UPDATE search_text SET label=? WHERE id=?', (label.casefold(), key))
                    self.db.execute('UPDATE documents SET label=? WHERE id=?', (label, key))
                if not old or old[0] != identity or old[1] != version:
                    if self.active.get(key) != job[:2]: self.jobs[key] = job
            self.desired = wanted
            self.jobs = OrderedDict((key, job) for key, job in self.jobs.items() if key in wanted)
            self.db.commit()
            self.generation += 1
            self.cache.clear()
            self.stamp = stamp
            if self.jobs and (not self.worker or not self.worker.is_alive()):
                self.worker = threading.Thread(target=self._build, daemon=True, name='session-search-index')
                self.worker.start()

    def _build(self):
        try:
            self._run()
        finally:
            with self.lock:
                if self.stopped and not self.closed:
                    self.db.close()
                    self.closed = True

    def _run(self):
        while True:
            with self.lock:
                if self.stopped or not self.jobs:
                    # Release ownership before another sync can queue work.
                    self.worker = None
                    return
                key, job = self.jobs.popitem(last=False)
                self.active[key] = job[:2]
            identity, version, label, adapter, native = job
            error = None
            try:
                reader = getattr(adapter, 'search_document', None)
                if not callable(reader): raise ValueError('此来源未提供可索引的对话正文')
                body = reader(native)
                if json.dumps(adapter.revision(native), sort_keys=True) != version:
                    # Never stamp a changing transcript as a complete current index.
                    with self.lock:
                        self.stamp = None
                        self.active.pop(key, None)
                    continue
            except Exception as exc:
                body, error = '', str(exc)
            with self.lock:
                self.active.pop(key, None)
                current = self.desired.get(key)
                if self.stopped: return
                if not current or current[:2] != job[:2]: continue
                label = current[2]
                self.db.execute('DELETE FROM search_text WHERE id=?', (key,))
                self.db.execute('INSERT INTO search_text VALUES(?,?,?)', (key, label.casefold(), body.casefold()))
                self.db.execute('UPDATE documents SET version=?,error=? WHERE id=?', (version, error, key))
                self.db.commit()
                self.generation += 1
                self.cache.clear()

    def find(self, needles, ids):
        with self.lock:
            if self.stopped:
                return set(), {'pending': 0, 'indexed': 0, 'total': 0, 'failed': 0}
            key = needles
            if key not in self.cache:
                indexed = [term for term in needles if len(term) >= 3 and '\0' not in term]
                where, values = [], []
                if self.fts and indexed:
                    where.append('search_text MATCH ?')
                    values.append(' AND '.join('"'+term.replace('"', '""')+'"' for term in indexed))
                where.extend("instr(label||'\n'||text,?)>0" for term in needles)
                values.extend(needles)
                sql = 'SELECT id FROM search_text'+(' WHERE '+' AND '.join(where) if where else '')
                self.cache[key] = {row[0] for row in self.db.execute(sql, values)}
                if len(self.cache) > 32: self.cache.popitem(last=False)
            found = self.cache[key] & ids
            states = {row[0]: row[1:] for row in self.db.execute('SELECT id,version,error FROM documents') if row[0] in ids}
            pending = sum(key not in states or key not in self.desired or states[key][0] != self.desired[key][1] for key in ids)
            failed = sum(bool(state[1]) for state in states.values())
            return found, {'pending': pending, 'indexed': len(ids)-pending, 'total': len(ids), 'failed': failed}

    def close(self):
        with self.lock:
            self.stopped = True
            self.jobs.clear()
            if (not self.worker or not self.worker.is_alive()) and not self.closed:
                self.db.close()
                self.closed = True
