"""Application-owned preferences; never write to an agent's history directory."""
import json
import threading
from pathlib import Path

SOURCE_KEYS = ('codex:local', 'claude:local', 'antigravity:desktop', 'antigravity:cli')


class AppSettings:
    def __init__(self, directory, roots):
        self.path = Path(directory)/'settings.json'
        self.lock = threading.RLock()
        self.defaults = {'paths': {key: str(Path(root).expanduser().resolve()) for key, root in zip(SOURCE_KEYS, roots)},
                         'enabled': {key: True for key in SOURCE_KEYS}, 'syncSeconds': 3, 'animations': True}

    def read(self):
        with self.lock:
            value = json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else {}
            return {**self.defaults, **value,
                    'paths': {**self.defaults['paths'], **value.get('paths', {})},
                    'enabled': {**self.defaults['enabled'], **value.get('enabled', {})}}

    def validate(self, value):
        if not isinstance(value, dict) or set(value) != set(self.defaults):
            raise ValueError('应用设置格式无效')
        if not isinstance(value['paths'], dict) or set(value['paths']) != set(SOURCE_KEYS):
            raise ValueError('会话目录配置无效')
        if not isinstance(value['enabled'], dict) or set(value['enabled']) != set(SOURCE_KEYS) or any(type(v) is not bool for v in value['enabled'].values()):
            raise ValueError('来源开关无效')
        if type(value['syncSeconds']) is not int or not 3 <= value['syncSeconds'] <= 60 or type(value['animations']) is not bool:
            raise ValueError('刷新间隔应为 3 到 60 秒')
        paths = {}
        for key, raw in value['paths'].items():
            if not isinstance(raw, str) or not raw.strip() or '\x00' in raw:
                raise ValueError('目录不能为空')
            path = Path(raw.strip()).expanduser()
            if not path.is_absolute(): raise ValueError('请填写绝对目录或使用 ~/ 开头')
            if path.exists() and not path.is_dir(): raise ValueError('请选择目录，不能填写文件路径')
            paths[key] = str(path.resolve())
        return {**value, 'paths': paths}

    def write(self, value):
        value = self.validate(value)
        with self.lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix('.tmp')
            temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
            temporary.replace(self.path)
        return value


class ViewSettings:
    def __init__(self, directory):
        self.path = Path(directory)/'view.json'
        self.lock = threading.RLock()

    def read(self):
        with self.lock:
            if not self.path.exists(): return {'saved': False, 'value': {}}
            return {'saved': True, 'value': json.loads(self.path.read_text(encoding='utf-8'))}

    def write(self, value):
        allowed = {'pinned', 'archived', 'aliases', 'metadata', 'projectAssignments'}
        if not isinstance(value, dict) or set(value)-allowed:
            raise ValueError('会话视图设置格式无效')
        if any(not isinstance(value.get(k, []), list) for k in ('pinned', 'archived')) or any(not isinstance(value.get(k, {}), dict) for k in ('aliases', 'metadata', 'projectAssignments')):
            raise ValueError('会话视图设置格式无效')
        with self.lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix('.tmp')
            temporary.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
            temporary.replace(self.path)
        return {'saved': True}
