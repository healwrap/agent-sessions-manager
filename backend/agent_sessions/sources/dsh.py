"""Read native DSH JSONL generations, including concatenated Zstandard frames."""
from __future__ import annotations
import io
import hashlib
import json
import re
import shutil
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from agent_sessions.context.text import compact_line
from .base import HistoryStore, as_text, read_row
from .dsh_metadata import metadata, content
from .dsh_events import events
from .dsh_detail import enrich_detail, attachment_bytes, blocks_at


@contextmanager
def transcript_stream(path):
    with path.open('rb') as handle:
        if path.suffix != '.zstd':
            yield handle
        else:
            try: import zstandard
            except ImportError as error: raise ValueError('读取 DSH 压缩日志需要安装 requirements.txt 中的 zstandard') from error
            try:
                with zstandard.ZstdDecompressor().stream_reader(handle, read_across_frames=True) as reader:
                    yield io.BufferedReader(reader)
            except zstandard.ZstdError as error:
                raise ValueError('DSH 压缩日志损坏或尚未写入完成') from error


class DshStore(HistoryStore):
    def __init__(self, root):
        super().__init__(root, 'dsh', 'local')
        self.raw_files = {}; self.decoded = {}; self.headers = {}; self.failures = {}; self.titles = {}; self.workspaces = {}
        self.temporary = tempfile.TemporaryDirectory(prefix='agent-sessions-dsh-')

    def discover(self):
        try:
            self.workspaces = json.loads((self.root/'storages/workspace.json').read_text(encoding='utf-8'))['tables']['workspaces']
            if not isinstance(self.workspaces, dict): self.workspaces = {}
        except (OSError, ValueError, KeyError, TypeError): self.workspaces = {}
        directory = self.root/'sessions' if (self.root/'sessions').is_dir() else self.root
        candidates = {}
        for path in directory.glob('*/*/session*.jsonl*'):
            match = re.fullmatch(r'session(?:\.v([1-9]\d*))?\.jsonl(?:\.zstd)?', path.name)
            if match: candidates.setdefault(str(path.parent.relative_to(directory)), []).append((int(match[1] or 0), path))
        try:
            cache = json.loads((self.root/'storages/session_projcache.json').read_text(encoding='utf-8')).get('tables', {}).get('sessions', {})
        except (OSError, ValueError): cache = {}
        rows = {}; raw_files = {}; failures = {}
        for key, generations in candidates.items():
            version = max(v for v, _ in generations)
            selected = [p for v, p in generations if v == version]
            path = selected[0]; stat = path.stat(); header = {}
            try:
                if len(selected) != 1: raise ValueError('同一代 DSH 日志存在重复文件，请在来源设置中指定唯一目录')
                revision = (str(path), stat.st_size, stat.st_mtime_ns)
                old = self.headers.get(key)
                if old and old[0] == revision: header = old[1]
                else:
                    with transcript_stream(path) as stream:
                        line = stream.readline(1024*1024+1)
                    if len(line) > 1024*1024 or not line.endswith(b'\n'): raise ValueError('DSH 会话头不完整')
                    header = json.loads(line)
                    if header.get('type') != 'session' or header.get('version') != version: raise ValueError('DSH 日志文件与会话头版本不一致')
                    self.headers[key] = (revision, header)
                if version > 4: raise ValueError(f'暂不支持 DSH 日志版本 v{version}')
            except (ValueError, OSError) as error: failures[key] = str(error)
            projection = cache.get(header.get('id', path.parent.name), {})
            projection_path = self.root/'storages/session_projcache/sessions'/(str(header.get('id', path.parent.name))+'.json')
            if projection_path.parent == self.root/'storages/session_projcache/sessions':
                try:
                    projection = json.loads(projection_path.read_text(encoding='utf-8'))['record']
                except (OSError, ValueError, KeyError): pass
            title = projection.get('rows', {}).get('title', {}).get('val')
            if self.titles.get(key, (None,))[0] == (str(path), stat.st_size, stat.st_mtime_ns):
                title = self.titles[key][1]
            cwd = header.get('cwd') or projection.get('identity', {}).get('cwd') or ''
            rows[key] = {'id': key, 'native_id': header.get('id', path.parent.name), 'title': title or path.parent.name,
                         'cwd': cwd, 'updated_at': datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(),
                         'transcript_available': key not in failures, 'unavailable_reason': failures.get(key),
                         **self.project(header.get('id', path.parent.name), cwd)}
            raw_files[key] = path
        self.rows, self.raw_files, self.failures = rows, raw_files, failures
        self.files = {key: self.decoded[key][1] if key in self.decoded else path for key, path in raw_files.items()}
        return list(rows.values())

    def project(self, native, cwd=None):
        directory = super().project(native, cwd)
        memberships = []; same_path = []
        for key, workspace in self.workspaces.items():
            if not isinstance(workspace, dict) or not isinstance(workspace.get('path'), str) or not workspace['path']: continue
            path = str(Path(workspace['path']).expanduser().resolve())
            title = workspace.get('title')
            project = {'project_id': 'dsh:workspace:'+key, 'project_label': title if isinstance(title, str) and title else Path(path).name,
                       'project_path': path, 'project_source': 'membership'}
            sessions = workspace.get('sessionIds')
            if isinstance(sessions, list) and native in sessions: memberships.append(project)
            if path == directory['project_path']: same_path.append(project)
        candidates = memberships or same_path
        return candidates[0] if len(candidates) == 1 else directory

    def session(self, key):
        with self.lock:
            self.discover()
            if key not in self.raw_files: raise FileNotFoundError('没有找到 DSH 会话')
            source = self.raw_files[key]; stat = source.stat()
            if key in self.failures:
                return {'source': source, 'events': [], 'lookup': {}, 'turns': [],
                        'index': {'meta': {'title': self.rows[key]['title'], 'cwd': self.rows[key]['cwd']},
                                  'source_size': stat.st_size, 'source_mtime_ns': stat.st_mtime_ns}}
            version = (str(source), stat.st_size, stat.st_mtime_ns)
            old = self.decoded.get(key)
            if not old or old[0] != version:
                target = Path(self.temporary.name)/(hashlib.sha256(key.encode()).hexdigest()+'.jsonl')
                with transcript_stream(source) as reader, target.open('wb') as writer:
                    shutil.copyfileobj(reader, writer, 128*1024)
                after = source.stat()
                if (after.st_size, after.st_mtime_ns) != version[1:]:
                    raise OSError('DSH 会话正在更新，请稍后重试')
                self.decoded[key] = (version, target)
                self.indexes.pop(key, None)
                while len(self.decoded) > 5:
                    victim = next(k for k in self.decoded if k != key)
                    self.decoded.pop(victim)[1].unlink(missing_ok=True)
                    self.indexes.pop(victim, None)
            self.files[key] = self.decoded[key][1]
            data = super().session(key)
            title = next((r['title'] for _, _, r in reversed(self.indexes[key]['rows']) if r['type'] == 'session/title' and r['title']), None)
            if title:
                self.titles[key] = (version, title)
                self.rows[key]['title'] = data['index']['meta']['title'] = title
            data['index']['source_size'] = stat.st_size
            data['index']['source_mtime_ns'] = stat.st_mtime_ns
            return data

    def detail(self, key, *args, **kwargs):
        result = super().detail(key, *args, **kwargs)
        return enrich_detail(self, key, result)

    def trajectory_search_text(self, data, event, record_type, location):
        source = data['source']
        row = read_row(source, location['offset'])
        values = [self.body(row, location)]
        if location.get('output'):
            output = location['output']
            values.append(self.body(read_row(source, output['offset']), output))
        if event['kind'] in ('user', 'assistant', 'context'):
            message = row.get('data', {}).get('message', row.get('data', {}))
            if isinstance(message, dict):
                values.append(json.dumps(message.get('source'), ensure_ascii=False))
            values.extend(json.dumps(block, ensure_ascii=False) for block in blocks_at(self, data, location))
        if event['kind'] in ('tool', 'subtool') and location.get('header'):
            header = read_row(source, location['header']['offset']).get('data', {}).get('header', {})
            values.extend(json.dumps(tool, ensure_ascii=False) for tool in header.get('tools', [])
                          if tool.get('name') == event['name'])
        return ' '.join(values)

    def attachment(self, key, ref, index, part='output'):
        return attachment_bytes(self, key, ref, index, part)

    def matches_content(self, key, query):
        # Compressed source versions, rather than disposable decoded paths, own freshness.
        with self.lock:
            self.discover()
            source = self.raw_files[key]; stat = source.stat()
            version = (str(source), stat.st_size, stat.st_mtime_ns, query.casefold())
            if self.search_matches.get(key, (None,))[0] != version:
                data = self.session(key)
                found = any(query.casefold() in self.message_search_text(data, data['lookup'][e['ref']][1]).casefold()
                            for e in data['events'] if e['kind'] in ('user', 'assistant'))
                self.search_matches[key] = (version, found)
            return self.search_matches[key][1]

    def metadata(self, row):
        return metadata(row)

    def events(self, rows):
        return events(rows)

    def body(self, row, location):
        data = row.get('data') or {}; message = data.get('message', data)
        if location['part'] == 'arguments': return str(data.get('arguments', ''))
        if location['part'] == 'dispatch_arguments': return json.dumps(data.get('arguments'), ensure_ascii=False)
        if location['part'] == 'dispatch_result': return as_text(data.get('content', []))
        if location['part'] == 'header': return json.dumps(data.get('header', {}), ensure_ascii=False, indent=2)
        if location['part'] == 'summary': return as_text(data.get('summary'))
        if row.get('type') == 'llm/retry': return json.dumps(data, ensure_ascii=False, indent=2)
        if location['part'] == 'result' and location.get('block') is not None:
            return as_text(message['content'][location['block']].get('content'))
        if location['part'] == 'result': return as_text(message.get('content'))
        if row.get('type') == 'assistant/message' and location['part'] == 'text':
            return '\n\n'.join(filter(None, [content(message.get('content', []), 'reasoning'), content(message.get('content', []), 'text')])) or location.get('placeholder', '')
        return content(message.get('content', []), location['part']) or location.get('placeholder', '')
