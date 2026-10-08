"""The only interface the catalogue/API need from a local source plugin."""
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, ContextManager, Protocol


class SourceAdapter(Protocol):
    root: Path
    rows: dict
    lock: ContextManager

    def available(self) -> bool: ...
    # Optional row fields: session_kind, native parent_id, agent_name, agent_role.
    # Optional session_activity(key): status, task_preview, result_preview, result_ref. Sources
    # without this hook retain readable child sessions with an unknown status.
    def discover(self) -> list[dict]: ...
    def revision(self, key) -> str: ...
    def trajectory(self, key, offset=0, limit=150, query='', kind='all') -> dict: ...
    def detail(self, key, ref, page=1, part='input') -> dict: ...
    def focus(self, key, start, end, mode='position') -> dict: ...
    def matches_content(self, key, query) -> bool: ...
    def attachment(self, key, ref, index, part='output') -> tuple[bytes, str]: ...


@dataclass(frozen=True)
class PathField:
    key: str
    label: str
    default: Callable[[], Path]
    hint: str = ''


@dataclass(frozen=True)
class SourcePlugin:
    id: str
    label: str
    create: Callable[[dict[str, Path]], SourceAdapter]
    paths: tuple[PathField, ...]
    # Existing links may use an alias and a prefix inside the unified adapter.
    aliases: dict[str, str] = field(default_factory=dict)
    capabilities: dict[str, bool] = field(default_factory=dict)
    api_version: int = 1


class SourceRegistry:
    def __init__(self, plugins, paths):
        self.plugins = {}; self.adapters = {}; self.routes = {}
        for plugin in plugins:
            self.register(plugin, paths)

    def register(self, plugin, paths):
        if plugin.api_version != 1: raise ValueError('不支持此来源接口版本')
        keys = (plugin.id, *plugin.aliases)
        if any(key in self.routes for key in keys): raise ValueError('会话来源 ID 重复')
        adapter = plugin.create(paths)
        required = ('available', 'discover', 'revision', 'trajectory', 'detail', 'focus', 'matches_content', 'attachment')
        if any(not callable(getattr(adapter, name, None)) for name in required):
            raise ValueError('会话来源未实现完整的标准接口')
        if not isinstance(getattr(adapter, 'root', None), Path) or not isinstance(getattr(adapter, 'rows', None), dict):
            raise ValueError('会话来源未提供标准目录与会话索引')
        lock = getattr(adapter, 'lock', None)
        if not callable(getattr(lock, '__enter__', None)) or not callable(getattr(lock, '__exit__', None)):
            raise ValueError('会话来源未提供目录读取锁')
        self.plugins[plugin.id] = plugin; self.adapters[plugin.id] = adapter
        self.routes[plugin.id] = (plugin.id, '')
        self.routes.update({key: (plugin.id, prefix) for key, prefix in plugin.aliases.items()})

    def public_source(self, source):
        return self.routes.get(source, (source, ''))[0]

    def resolve(self, source, native):
        public, prefix = self.routes[source]
        return public, prefix+native

    def qualify(self, source, row):
        route = row.get('route_id', source)
        native = row.get('route_key', row['id'])
        if self.resolve(route, native) != (source, row['id']):
            raise ValueError('来源返回了未注册的会话路由')
        return route+':'+native
