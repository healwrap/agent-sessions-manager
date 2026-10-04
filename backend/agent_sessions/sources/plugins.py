"""Built-in source registrations. Add a source here, not in the API or UI."""
from pathlib import Path
from agent_sessions.context.locator import codex_root
from agent_sessions.paths import claude_root, claude_desktop_root, cursor_root
from .contract import PathField, SourcePlugin
from .codex import Store
from .claude_source import ClaudeSourceStore
from .antigravity import AntigravityStore
from .dsh import DshStore
from .cursor import CursorStore

PLUGINS = (
    SourcePlugin('codex:local', 'Codex', lambda p: Store(p['codex:local']),
                 (PathField('codex:local', '会话目录', codex_root),), capabilities={'attachments': True}),
    SourcePlugin('claude:local', 'Claude Code',
                 lambda p: ClaudeSourceStore(p['claude:local'], p['claude:desktop']),
                 (PathField('claude:local', '会话目录', claude_root, '桌面端与 CLI 共用的会话目录'),
                  PathField('claude:desktop', '补充会话索引（可选）', claude_desktop_root,
                            '用于补充桌面会话标题，目录不存在也可读取共享正文。')),
                 aliases={'claude:desktop': 'desktop/'}, capabilities={'source_blocks': True, 'attachments': True}),
    SourcePlugin('antigravity:desktop', 'Antigravity',
                 lambda p: AntigravityStore(p['antigravity:desktop'], 'desktop'),
                 (PathField('antigravity:desktop', '会话目录', lambda: Path.home()/'.gemini/antigravity',
                            '读取本地导出的记录'),)),
    SourcePlugin('antigravity:cli', 'Antigravity CLI',
                 lambda p: AntigravityStore(p['antigravity:cli'], 'cli'),
                 (PathField('antigravity:cli', '会话目录', lambda: Path.home()/'.gemini/antigravity-cli',
                            '读取本地导出的记录'),)),
    SourcePlugin('dsh:local', 'DeepSeek Harness', lambda p: DshStore(p['dsh:local']),
                 (PathField('dsh:local', '会话目录', lambda: Path.home()/'.dsh',
                            '支持 JSONL 与 Zstandard 压缩日志'),),
                 capabilities={'source_blocks': True, 'attachments': True, 'requests': True, 'prompt_snapshots': True}),
    SourcePlugin('cursor:desktop', 'Cursor', lambda p: CursorStore(p['cursor:desktop']),
                 (PathField('cursor:desktop', '会话目录', cursor_root, '读取本地 Agent / Composer 会话数据库'),),
                 capabilities={'source_blocks': True, 'attachments': True}),
)


def path_fields():
    return {field.key: field for plugin in PLUGINS for field in plugin.paths}


# Preserve the old positional CLI/constructor order at the compatibility edge.
SOURCE_KEYS = ('codex:local', 'claude:local', 'antigravity:desktop', 'antigravity:cli',
               'claude:desktop', 'dsh:local', 'cursor:desktop')
