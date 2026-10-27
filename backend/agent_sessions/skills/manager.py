"""Plan, apply and read back local skill installations with recoverable backups."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import shutil
import threading
import time
from uuid import uuid4
from .catalog import entry_path, physical, targets
from .inspection import entry_fingerprint, inspect_target
from .payload import SkillPayload


def now():
    return datetime.now(timezone.utc).isoformat()


class SkillManager:
    def __init__(self, state, home=None, environ=None):
        self.home = Path(home) if home is not None else Path.home()
        self.environ = dict(os.environ if environ is None else environ)
        self.directory = Path(state)/'skills'
        self.settings = self.directory/'settings.json'
        self.payload = SkillPayload(state)
        self.lock, self.plans = threading.RLock(), {}

    def read(self):
        return json.loads(self.settings.read_text()) if self.settings.exists() else {'paths': {}, 'records': []}

    def write(self, value):
        self.directory.mkdir(parents=True, exist_ok=True)
        temporary = self.settings.with_suffix('.tmp')
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2))
        temporary.chmod(0o600)
        temporary.replace(self.settings)

    def definitions(self, settings=None):
        return targets(self.home, self.environ, (settings or self.read())['paths'])

    def state(self):
        with self.lock:
            source = self.payload.info()
            settings = self.read()
            rows = [inspect_target(target, self.payload) for target in self.definitions(settings)]
            records, seen = [], set()
            for record in reversed(settings['records']):
                key = physical(record['path'])
                active = record.get('success') and record['action'] != 'configure' and not record.get('restored')
                records.append({**record, 'can_restore': bool(record.get('can_restore') and key not in seen)})
                if active: seen.add(key)
            for row in rows:
                row['shared_with'] = [other['name'] for other in rows if other['id'] != row['id'] and row['path'] and
                    (other['path'] and physical(other['path']) == physical(row['path']) or other.get('shared_path') and physical(other['shared_path']) == physical(row['path']))]
            return {'source': source, 'targets': rows, 'records': records[:50], 'checked_at': now()}

    def plan(self, value):
        if not isinstance(value, dict) or set(value)-{'action', 'ids', 'method', 'path'}: raise ValueError('Skill 操作参数无效')
        action, ids, method = value.get('action'), value.get('ids'), value.get('method', 'link')
        if action not in ('install', 'update', 'repair', 'remove', 'configure') or method not in ('link', 'copy'):
            raise ValueError('Skill 操作或安装方式无效')
        if not isinstance(ids, list) or not ids or not all(isinstance(key, str) for key in ids) or len(ids) != len(set(ids)):
            raise ValueError('请选择安装目标')
        with self.lock:
            state = self.state()
            by_id = {target['id']: target for target in state['targets']}
            if any(key not in by_id for key in ids): raise ValueError('安装目标不存在')
            if action == 'configure' and len(ids) != 1: raise ValueError('请分别配置安装入口')
            rows = []
            for key in ids:
                target = by_id[key]
                path = entry_path(value.get('path') if action == 'configure' else target['path'], self.home)
                resolved_entry = Path(physical(path))
                if resolved_entry.is_relative_to(self.directory.resolve()) or (self.payload.development and resolved_entry == self.payload.development):
                    raise ValueError('安装入口不能指向应用的 Skill 源目录')
                if action == 'remove' and not os.path.lexists(path): raise ValueError(target['name']+' 没有专用入口；共享安装请使用「共享 Skill」管理')
                rows.append({'id': key, 'name': target['name'], 'path': str(path), 'physical': physical(path),
                             'before': entry_fingerprint(path), 'backup': os.path.lexists(path) and action != 'configure',
                             'affects': target['shared_with'], 'modified_files': target.get('modified_files', [])})
            token = secrets.token_urlsafe(24)
            plan = {'token': token, 'action': action, 'method': method, 'items': rows, 'version': self.payload.version,
                    'expires': time.time()+600}
            self.plans = {key: item for key, item in self.plans.items() if item['expires'] > time.time()}
            self.plans[token] = plan
            return plan

    def archive(self, path, record_id):
        if not os.path.lexists(path): return ''
        backup = self.directory/'backups'/record_id/'entry'
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(path), str(backup))
        return str(backup)

    def apply(self, value):
        if not isinstance(value, dict) or set(value) != {'token'} or not isinstance(value['token'], str): raise ValueError('请先取得安装计划')
        with self.lock:
            plan = self.plans.pop(value['token'], None)
            self.payload.ensure()
            if not plan or plan['expires'] < time.time() or plan['version'] != self.payload.version:
                raise ValueError('安装计划已过期或源版本已变化，请重新检查')
            if any(physical(item['path']) != item['physical'] or entry_fingerprint(item['path']) != item['before'] for item in plan['items']):
                raise ValueError('安装入口已被修改，请重新检查后再操作')
            settings, results, completed = self.read(), [], {}
            for item in plan['items']:
                if plan['action'] != 'configure' and item['physical'] in completed:
                    results.append({**completed[item['physical']], 'name': item['name'], 'target_id': item['id']})
                    continue
                record = self.execute(plan, item, settings)
                settings['records'].append(record)
                completed[item['physical']] = record
                results.append(record)
            settings['records'] = settings['records'][-200:]
            self.write(settings)
            return {**self.state(), 'results': results}

    def execute(self, plan, item, settings):
        key, action = str(uuid4()), plan['action']
        path = Path(item['path'])
        record = {'id': key, 'target_id': item['id'], 'name': item['name'], 'action': action,
                  'path': str(path), 'checked_at': now(), 'backup': '', 'restored': False}
        record['physical'] = item['physical']
        temporary = path.with_name('.agent-sessions-'+key)
        replaced = False
        try:
            if action == 'configure':
                settings['paths'][item['id']] = str(path)
                return {**record, 'success': True, 'message': '安装入口已保存', 'can_restore': False}
            path.parent.mkdir(parents=True, exist_ok=True)
            if action != 'remove':
                if plan['method'] == 'link': temporary.symlink_to(self.payload.current, target_is_directory=True)
                else: shutil.copytree(self.payload.path, temporary, symlinks=True)
            record['backup'] = self.archive(path, key)
            if action != 'remove':
                temporary.rename(path)
                replaced = True
            after = entry_fingerprint(path)
            actual = inspect_target({**next(target for target in self.definitions(settings) if target['id'] == item['id']), 'path': str(path), 'shared_path': ''}, self.payload)
            if action != 'remove' and actual['state'] != 'ready': raise ValueError('安装后读回未确认文件就绪：'+actual['note'])
            return {**record, 'success': True, 'message': '安装入口已移除并保留备份' if action == 'remove' else '文件已安装并读回确认',
                    'after': after, 'can_restore': True}
        except (OSError, ValueError) as error:
            if replaced: self.archive(path, key+'-failed')
            if record['backup'] and not os.path.lexists(path): shutil.move(record['backup'], path)
            return {**record, 'success': False, 'message': str(error), 'can_restore': False}
        finally:
            if temporary.is_symlink(): temporary.unlink()
            elif temporary.exists(): shutil.rmtree(temporary)

    def restore(self, value):
        if not isinstance(value, dict) or set(value) != {'id'}: raise ValueError('请选择需要恢复的操作记录')
        with self.lock:
            settings = self.read()
            record = next((row for row in settings['records'] if row['id'] == value['id']), None)
            if not record or not record.get('can_restore') or record['restored']: raise ValueError('此操作没有可恢复的备份')
            path = Path(record['path'])
            latest = next((row for row in reversed(settings['records']) if row.get('success') and row['action'] != 'configure'
                           and not row.get('restored') and physical(row['path']) == physical(path)), None)
            if latest is None or latest['id'] != record['id']: raise ValueError('此入口已有后续操作，请先恢复最近一次操作')
            if record.get('physical', physical(path)) != physical(path): raise ValueError('安装路径的目录映射已改变，请重新检查')
            if entry_fingerprint(path) != record['after']: raise ValueError('安装入口已被其他操作修改，不能覆盖当前内容')
            backup = record.get('backup')
            if backup and not os.path.lexists(backup): raise ValueError('原入口备份不存在')
            self.archive(path, str(uuid4()))
            if backup: shutil.move(backup, path)
            record.update(restored=True, can_restore=False)
            self.write(settings)
            return self.state()
