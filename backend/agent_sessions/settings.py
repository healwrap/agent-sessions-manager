"""Application-owned preferences; never write to an agent's history directory."""
import json
import threading
from pathlib import Path

from .sources.plugins import SOURCE_KEYS, path_fields

def shared_claude_switch(enabled):
    enabled = dict(enabled)
    # Old split preferences: retain access when either entry was enabled.
    shared = enabled.get('claude:local', True)
    if 'claude:desktop' in enabled: shared = shared or enabled['claude:desktop']
    return {**enabled, 'claude:local': shared, 'claude:desktop': shared}


class AppSettings:
    def __init__(self, directory, roots):
        from agent_sessions.paths import claude_desktop_root, cursor_root
        self.path = Path(directory)/'settings.json'
        self.lock = threading.RLock()
        roots = tuple(roots)
        if len(roots) == 4:
            roots += (claude_desktop_root(), Path.home()/'.dsh')
        if len(roots) == 6: roots += (cursor_root(),)
        if len(roots) != len(SOURCE_KEYS):
            raise ValueError('会话来源目录数量无效')
        self.defaults = {'paths': {key: str(Path(root).expanduser().resolve()) for key, root in zip(SOURCE_KEYS, roots)},
                         'enabled': {key: True for key in path_fields()}, 'syncSeconds': 3, 'animations': True,
                         'theme': 'system', 'chatDetail': 'standard', 'fontSize': 14}
        for key, field in path_fields().items():
            self.defaults['paths'].setdefault(key, str(field.default().expanduser().resolve()))

    def read(self):
        with self.lock:
            value = json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else {}
            theme = value.get('theme', 'system')
            enabled = shared_claude_switch(value.get('enabled', {}))
            return {**self.defaults, **value, 'theme': theme if theme in ('light', 'dark', 'system') else 'system',
                    'paths': {key: value.get('paths', {}).get(key, default) for key, default in self.defaults['paths'].items()},
                    'enabled': {key: enabled.get(key, default) for key, default in self.defaults['enabled'].items()}}

    def validate(self, value):
        optional = {'theme', 'chatDetail', 'fontSize'}
        if isinstance(value, dict) and set(self.defaults)-optional <= set(value) <= set(self.defaults):
            value = {**self.defaults, **value}
        if not isinstance(value, dict) or set(value) != set(self.defaults):
            raise ValueError('应用设置格式无效')
        legacy = set(SOURCE_KEYS)-{'cursor:desktop'}
        if isinstance(value.get('paths'), dict) and isinstance(value.get('enabled'), dict) and set(value['paths']) == set(value['enabled']) == legacy:
            value = {**value, 'paths': {**value['paths'], 'cursor:desktop': self.defaults['paths']['cursor:desktop']},
                     'enabled': {**value['enabled'], 'cursor:desktop': self.defaults['enabled']['cursor:desktop']}}
        if value['theme'] not in ('light', 'dark', 'system'):
            raise ValueError('外观应为浅色、深色或跟随系统')
        if value['chatDetail'] not in ('compact', 'standard', 'detailed', 'verbose'):
            raise ValueError('工作步骤展示选项无效')
        if type(value['fontSize']) is not int or not 12 <= value['fontSize'] <= 20:
            raise ValueError('字号大小应为 12 到 20 px')
        if not isinstance(value['paths'], dict) or set(value['paths']) != set(self.defaults['paths']):
            raise ValueError('会话目录配置无效')
        if not isinstance(value['enabled'], dict) or set(value['enabled']) != set(self.defaults['enabled']) or any(type(v) is not bool for v in value['enabled'].values()):
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
        allowed = {'pinned', 'archived', 'aliases', 'metadata', 'projectAssignments', 'showSubagents', 'sidebarWidth', 'detailWidth', 'accountListWidth'}
        if not isinstance(value, dict) or set(value)-allowed:
            raise ValueError('会话视图设置格式无效')
        if 'showSubagents' in value and type(value['showSubagents']) is not bool:
            raise ValueError('子代理显示选项无效')
        if 'sidebarWidth' in value and (type(value['sidebarWidth']) is not int or not 180 <= value['sidebarWidth'] <= 520):
            raise ValueError('侧栏宽度应为 180 到 520 像素')
        if 'detailWidth' in value and (type(value['detailWidth']) is not int or not 320 <= value['detailWidth'] <= 720):
            raise ValueError('详情宽度应为 320 到 720 像素')
        if 'accountListWidth' in value and (type(value['accountListWidth']) is not int or not 220 <= value['accountListWidth'] <= 520):
            raise ValueError('账号列表宽度应为 220 到 520 像素')
        if any(not isinstance(value.get(k, []), list) for k in ('pinned', 'archived')) or any(not isinstance(value.get(k, {}), dict) for k in ('aliases', 'metadata', 'projectAssignments')):
            raise ValueError('会话视图设置格式无效')
        with self.lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix('.tmp')
            temporary.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
            temporary.replace(self.path)
        return {'saved': True}
