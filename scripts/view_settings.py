"""Application-owned preferences; never write to an agent's history directory."""
import json
import threading
from pathlib import Path


class ViewSettings:
    def __init__(self, directory):
        self.path = Path(directory)/'view.json'
        self.lock = threading.RLock()

    def read(self):
        with self.lock:
            if not self.path.exists(): return {'saved': False, 'value': {}}
            return {'saved': True, 'value': json.loads(self.path.read_text())}

    def write(self, value):
        allowed = {'pinned', 'archived', 'aliases', 'metadata', 'projectAssignments'}
        if not isinstance(value, dict) or set(value)-allowed:
            raise ValueError('会话视图设置格式无效')
        if any(not isinstance(value.get(k, []), list) for k in ('pinned', 'archived')) or any(not isinstance(value.get(k, {}), dict) for k in ('aliases', 'metadata', 'projectAssignments')):
            raise ValueError('会话视图设置格式无效')
        with self.lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix('.tmp')
            temporary.write_text(json.dumps(value, ensure_ascii=False))
            temporary.replace(self.path)
        return {'saved': True}
