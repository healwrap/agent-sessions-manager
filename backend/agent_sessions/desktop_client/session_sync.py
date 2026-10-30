"""Synchronize local Code history before launching an isolated Claude App."""
import json
import os
from pathlib import Path
import tempfile
import time
import re
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, uuid5
from agent_sessions.paths import claude_root, claude_desktop_root
from agent_sessions.profile_ownership import directory
from .session_files import account_storage, conversations, fingerprint, load, slug


def extends(new, old):
    return len(new.rows) >= len(old.rows) and new.rows[:len(old.rows)] == old.rows


def atomic(path, data, backups, boundary):
    if not path.resolve().is_relative_to(boundary.resolve()):
        raise ValueError('同步目标超出当前环境目录：'+str(path))
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.is_symlink(): raise ValueError('同步目标不能是符号链接：'+str(path))
    if path.exists():
        previous = path.read_bytes()
        if previous == data: return
        backup = backups/fingerprint(previous)
        if not backup.exists():
            backups.mkdir(parents=True, exist_ok=True, mode=0o700)
            with backup.open('xb') as output:
                output.write(previous)
                output.flush()
                os.fsync(output.fileno())
            backup.chmod(0o600)
    descriptor, name = tempfile.mkstemp(prefix='.'+path.name+'.', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        Path(name).replace(path)
    finally:
        Path(name).unlink(missing_ok=True)


def encode(value):
    return json.dumps(value, ensure_ascii=False, indent=2).encode('utf-8')


def report_message(result):
    total = result['imported']+result['updated']+result['unchanged']
    text = f"已同步 {total} 条会话（新增 {result['imported']}，更新 {result['updated']}，无需更新 {result['unchanged']}）"
    if result['branches']: text += f"，另存分支 {result['branches']}"
    if result['skipped']: text += f"；另有 {result['skipped']} 条未同步"
    return text


def restore_report(run):
    """Keep a saved launch result identifiable after the manager restarts."""
    check = next((row for row in run.get('checks', []) if row['id'] == 'app-session-sync'), None)
    if not check: return
    if 'session_sync' not in run:
        match = re.search(r'新增 (\d+)，更新 (\d+)，已同步 (\d+)', check['value'])
        if not match: return
        imported, updated, unchanged = map(int, match.groups())
        issues = []
        for line in filter(None, check.get('detail', '').split('；')):
            path, separator, reason = line.partition('：')
            issues.append({'path': path, 'reason': reason if separator else line})
        branch = re.search(r'另存分支 (\d+)', check['value'])
        run['session_sync'] = dict(state='partial' if issues else 'complete', imported=imported,
                                  updated=updated, unchanged=unchanged, branches=int(branch[1]) if branch else 0,
                                  skipped=len(issues), issues=issues, completed_at=run['checked_at'])
    report = run['session_sync']
    report.setdefault('completed_at', run['checked_at'])
    for issue in report['issues']:
        if issue.get('title'): continue
        path = Path(issue['path'])
        issue['title'] = path.stem
        try:
            record = load(path) if path.suffix == '.json' else {}
            if isinstance(record, dict): issue['title'] = record.get('title') or record.get('name') or path.stem
        except (ValueError, OSError): pass
    if report['state'] != 'pending':
        report['message'] = report_message(report)
        check['value'] = report['message']
        if report['skipped']: check['label'] = '部分未同步'


def sidecars(source, target, cli_id, backups):
    project = source.code/'projects'/slug(source.cwd)
    destinations = [(project/source.cli_id, target/'claude-code/projects'/slug(source.cwd)/cli_id),
                    (source.code/'file-history'/source.cli_id, target/'claude-code/file-history'/cli_id)]
    for root, destination in destinations:
        if not root.is_dir(): continue
        if root.is_symlink(): raise ValueError('会话附属目录是符号链接：'+str(root))
        for path in root.rglob('*'):
            if path.is_symlink(): raise ValueError('会话附属文件是符号链接：'+str(path))
            if path.is_file(): atomic(destination/path.relative_to(root), path.read_bytes(), backups, target)


def synchronize(root, profile_id, settings, paths=None):
    root = Path(root)
    target = directory(root, 'app_profiles', profile_id)
    storage = account_storage(target)
    result = {'state': 'complete', 'imported': 0, 'updated': 0, 'unchanged': 0, 'branches': 0, 'skipped': 0, 'issues': [],
              'completed_at': datetime.now(timezone.utc).isoformat()}
    if storage is None:
        return {**result, 'state': 'pending', 'message': '登录并选择组织后，再次打开环境会自动同步全部本地 Code 会话'}
    paths = paths or {}
    sources = [(profile['id'], directory(root, 'app_profiles', profile['id'])/'claude-code',
                 directory(root, 'app_profiles', profile['id'])/'claude-code-sessions') for profile in settings['app_profiles']]
    sources.append(('default', Path(paths.get('claude:local') or claude_root()), Path(paths.get('claude:desktop') or claude_desktop_root())))
    groups, seen, seen_files = {}, set(), set()
    for environment, code, indexes in sources:
        if (code.resolve(), indexes.resolve()) in seen: continue
        seen.add((code.resolve(), indexes.resolve()))
        rows, issues = conversations(environment, code, indexes)
        result['issues'].extend(issues)
        rows.sort(key=lambda row: not (environment == profile_id and row.index_path and row.index_path.parent == storage))
        for row in rows:
            path = row.path.resolve()
            if path in seen_files: continue
            seen_files.add(path)
            groups.setdefault((row.base_id, row.cwd), []).append(row)
    manifest_path = target/'agent-sessions-sync.json'
    manifest = load(manifest_path)
    manifest.setdefault('sessions', {})
    backups = root/'claude-app/session-sync-backups'/profile_id
    for (base_id, cwd), candidates in groups.items():
        # Keep the longest compatible history, and retain independently continued branches.
        leaves = []
        for candidate in sorted(candidates, key=lambda row: (len(row.rows), row.record.get('lastActivityAt', 0)), reverse=True):
            if not any(extends(leaf, candidate) for leaf in leaves): leaves.append(candidate)
        existing = [row for row in candidates if row.environment == profile_id and
                    (row.index_path is None or row.index_path.parent == storage)]
        used = set()
        for source in leaves:
            matches = [row for row in existing if row.cli_id not in used and extends(source, row)]
            own = next((row for row in matches if row.digest == source.digest), matches[0] if matches else None)
            if own and own.digest == source.digest and own.index_path is not None:
                used.add(own.cli_id)
                result['unchanged'] += 1
                continue
            if own:
                cli_id = own.cli_id
            elif not existing and not used:
                cli_id = str(uuid5(NAMESPACE_URL, 'agent-sessions:'+profile_id+':'+base_id+':'+cwd+':primary'))
            else:
                cli_id = str(uuid5(NAMESPACE_URL, 'agent-sessions:'+profile_id+':'+base_id+':'+cwd+':'+source.origin))
                if cli_id in used: cli_id = str(uuid5(NAMESPACE_URL, cli_id+':'+source.digest))
                result['branches'] += 1
            used.add(cli_id)
            session_id = own.record['sessionId'] if own else 'local_'+cli_id
            index = own.index_path if own and own.index_path else storage/(session_id+'.json')
            if not own and index.exists(): raise ValueError('目标会话 ID 已被占用：'+str(index))
            confirmed = bool(own and not (own.record.get('importedFrom') and not own.record.get('resumeConfirmed')))
            transcript = target/'claude-code/projects'/slug(cwd)/(cli_id+'.jsonl') if confirmed else storage/'imported-staging'/(cli_id+'.jsonl')
            if not own and transcript.exists() and transcript.read_bytes() != source.data:
                raise ValueError('目标会话正文已被占用：'+str(transcript))
            sidecars(source, target, cli_id, backups)
            atomic(transcript, source.data, backups, target)
            record = dict(own.record) if own else {}
            record.update(sessionId=session_id, cliSessionId=cli_id, cwd=cwd, originCwd=cwd,
                          title=source.record.get('title') or source.record.get('name') or cli_id,
                          createdAt=source.record.get('createdAt', time.time()*1000),
                          lastActivityAt=source.record.get('lastActivityAt', time.time()*1000),
                          indexedAt=time.time()*1000, isArchived=source.record.get('isArchived', False))
            if not confirmed:
                record.update(importedFrom='terminal-cli' if source.record.get('importedFrom') == 'terminal-cli' else 'local-1p-code',
                              stagedTranscriptPath=str(transcript))
            else:
                record.pop('stagedTranscriptPath', None)
            for name in ('completedTurns', 'lastAssistantUuid', 'postTurnSummary', 'postTurnSummaryFor'):
                record.pop(name, None)
                if name in source.record: record[name] = source.record[name]
            atomic(index, encode(record), backups, target)
            manifest['sessions'][session_id] = {'base_id': base_id, 'origin': source.origin, 'digest': source.digest,
                                                 'cli_id': cli_id, 'source_environment': source.environment}
            atomic(manifest_path, encode(manifest), backups, target)
            result['updated' if own else 'imported'] += 1
    result['skipped'] = len(result['issues'])
    if result['skipped']: result['state'] = 'partial'
    result['completed_at'] = datetime.now(timezone.utc).isoformat()
    result['message'] = report_message(result)
    return result
