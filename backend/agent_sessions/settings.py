"""Application-owned preferences; never write to an agent's history directory."""
import json
import threading
from pathlib import Path

SOURCE_KEYS = ('codex:local', 'claude:local', 'antigravity:desktop', 'antigravity:cli', 'claude:desktop', 'dsh:local')

def shared_claude_switch(enabled):
    enabled = dict(enabled)
    # Old split preferences: retain access when either entry was enabled.
    shared = enabled.get('claude:local', True)
    if 'claude:desktop' in enabled: shared = shared or enabled['claude:desktop']
    return {**enabled, 'claude:local': shared, 'claude:desktop': shared}


class AppSettings:
    def __init__(self, directory, roots):
        from agent_sessions.paths import claude_desktop_root
        self.path = Path(directory)/'settings.json'
        self.lock = threading.RLock()
        roots = tuple(roots)
        if len(roots) == 4:
            roots += (claude_desktop_root(), Path.home()/'.dsh')
        if len(roots) != len(SOURCE_KEYS):
            raise ValueError('会话来源目录数量无效')
        self.defaults = {'paths': {key: str(Path(root).expanduser().resolve()) for key, root in zip(SOURCE_KEYS, roots)},
                         'enabled': {key: True for key in SOURCE_KEYS}, 'syncSeconds': 3, 'animations': True, 'theme': 'system'}

    def read(self):
        with self.lock:
            value = json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else {}
            theme = value.get('theme', 'system')
            enabled = shared_claude_switch(value.get('enabled', {}))
            return {**self.defaults, **value, 'theme': theme if theme in ('light', 'dark', 'system') else 'system',
                    'paths': {key: value.get('paths', {}).get(key, default) for key, default in self.defaults['paths'].items()},
                    'enabled': {key: enabled.get(key, default) for key, default in self.defaults['enabled'].items()}}

    def validate(self, value):
        if isinstance(value, dict) and set(value) == set(self.defaults)-{'theme'}:
            value = {**value, 'theme': 'system'}
        if not isinstance(value, dict) or set(value) != set(self.defaults):
            raise ValueError('应用设置格式无效')
        if value['theme'] not in ('light', 'dark', 'system'):
            raise ValueError('外观应为浅色、深色或跟随系统')
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
        return {**value, 'paths': paths, 'enabled': {**value['enabled'], 'claude:desktop': value['enabled']['claude:local']}}

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
