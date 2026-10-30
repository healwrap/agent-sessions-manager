"""Read local Code conversations without changing their native payloads."""
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
from uuid import UUID


def uuid(value):
    try: return str(UUID(value)) if isinstance(value, str) else None
    except ValueError: return None


def load(path):
    return json.loads(path.read_text(encoding='utf-8')) if path.is_file() else {}


def fingerprint(data):
    return hashlib.sha256(data).hexdigest()


def slug(cwd):
    return re.sub(r'[^a-zA-Z0-9]', '-', cwd)


@dataclass
class Conversation:
    environment: str
    code: Path
    path: Path
    record: dict
    cli_id: str
    base_id: str
    origin: str
    data: bytes
    rows: list
    index_path: Path | None = None

    @property
    def digest(self): return fingerprint(self.data)

    @property
    def cwd(self): return self.record.get('originCwd') or self.record['cwd']


def snapshot(environment, code, path, record, cli_id, receipt, index_path=None):
    before = path.stat()
    data = path.read_bytes()
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise ValueError('会话仍在写入，将在下次启动时同步')
    rows = [json.loads(line) for line in data.splitlines() if line.strip()]
    if not rows or any(not isinstance(row, dict) for row in rows):
        raise ValueError('会话正文不是完整的 JSONL 记录')
    # Compare history across native resume operations; copy the original bytes verbatim.
    comparable = [{k: v for k, v in row.items() if k != 'sessionId'} for row in rows]
    origin = receipt.get('origin', environment) if receipt.get('digest') == fingerprint(data) else environment
    return Conversation(environment, code, path, record, cli_id,
                        uuid(receipt.get('base_id')) or cli_id, origin, data, comparable, index_path)


def conversations(environment, code, indexes):
    code, indexes = Path(code), Path(indexes)
    manifest = load(indexes.parent/'agent-sessions-sync.json').get('sessions', {})
    files = list((code/'projects').glob('*/*.jsonl'))
    by_id = {}
    for path in files: by_id.setdefault(path.stem, []).append(path)
    rows, issues, represented = [], [], set()
    for index in sorted([*indexes.glob('*/*/*.json'), *indexes.glob('*.json')]):
        record = {}
        try:
            record = load(index)
            if not isinstance(record, dict) or not isinstance(record.get('sessionId'), str) or not isinstance(record.get('cwd'), str): continue
            cli_id = uuid(record.get('cliSessionId') or record.get('unarchivedCliSessionId'))
            if not cli_id: raise ValueError('只有会话索引，尚未生成可恢复的本地 Code ID')
            if record.get('sshConfig') or record.get('wslConfig'): raise ValueError('远程环境会话需保留在原环境中')
            matches = by_id.get(cli_id, [])
            direct = code/'projects'/slug(record.get('originCwd') or record['cwd'])/(cli_id+'.jsonl')
            path = direct if direct in matches else matches[0] if len(matches) == 1 else None
            if path is None and record.get('stagedTranscriptPath'):
                staged = Path(record['stagedTranscriptPath'])
                if staged.parent.resolve() == (index.parent/'imported-staging').resolve() and staged.is_file(): path = staged
            if path is None: raise ValueError('尚未找到此会话的本地正文')
            if path.is_symlink(): raise ValueError('会话正文是符号链接，未复制')
            rows.append(snapshot(environment, code, path, record, cli_id, manifest.get(record['sessionId'], {}), index))
            represented.add(path)
        except (ValueError, OSError) as error:
            issues.append({'environment_id': environment, 'path': str(index),
                           'title': record.get('title') or record.get('name') or index.stem, 'reason': str(error)})
    for path in sorted(files):
        if path in represented or not uuid(path.stem): continue
        try:
            if path.is_symlink(): raise ValueError('会话正文是符号链接，未复制')
            raw = [json.loads(line) for line in path.read_bytes().splitlines() if line.strip()]
            cwd = next((row['cwd'] for row in reversed(raw) if row.get('cwd')), '')
            if not Path(cwd).is_absolute(): raise ValueError('此会话尚无可恢复的本地工作目录')
            title = next((row['customTitle'] for row in reversed(raw) if row.get('customTitle')), '')
            if not title:
                from agent_sessions.sources.base import as_text
                title = next((as_text((row.get('message') or {}).get('content', ''))[:160]
                              for row in raw if row.get('type') == 'user'), '')
            record = {'sessionId': 'local_'+path.stem, 'cliSessionId': path.stem, 'cwd': cwd,
                      'title': title or path.stem, 'createdAt': path.stat().st_birthtime*1000 if hasattr(path.stat(), 'st_birthtime') else path.stat().st_mtime*1000,
                      'lastActivityAt': path.stat().st_mtime*1000, 'importedFrom': 'terminal-cli'}
            rows.append(snapshot(environment, code, path, record, path.stem, {}, None))
        except (ValueError, OSError, AttributeError) as error:
            issues.append({'environment_id': environment, 'path': str(path), 'title': path.stem, 'reason': str(error)})
    return rows, issues


def account_storage(profile):
    account = load(profile/'config.json').get('lastKnownAccountUuid')
    if not uuid(account): return None
    oauth = load(profile/'claude-code/.claude.json').get('oauthAccount', {})
    organization = oauth.get('organizationUuid') if oauth.get('accountUuid') == account else None
    root = profile/'claude-code-sessions'/account
    if not uuid(organization):
        choices = [path.name for path in root.iterdir() if path.is_dir() and uuid(path.name)] if root.is_dir() else []
        organization = choices[0] if len(choices) == 1 else None
    return root/organization if uuid(organization) else None
