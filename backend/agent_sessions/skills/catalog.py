"""Agent-specific user skill entry points, kept separate from installation mechanics."""
import os
from pathlib import Path

NAME = 'agent-sessions'


def targets(home, environ, overrides):
    legacy = Path(environ.get('CODEX_HOME') or home/'.codex')/'skills'/NAME
    shared = home/'.agents/skills'/NAME
    codex = legacy if os.path.lexists(legacy) or environ.get('CODEX_HOME') else shared
    claude = Path(environ.get('CLAUDE_CONFIG_DIR') or home/'.claude')/'skills'/NAME
    definitions = [
        ('codex', 'Codex', 'Desktop / CLI', codex, str(shared) if codex != shared else '', 'https://learn.chatgpt.com/docs/build-skills'),
        ('claude', 'Claude Code', '本机 Code / CLI', claude, '', 'https://code.claude.com/docs/en/skills'),
        ('cursor', 'Cursor', '本机 Agent', home/'.cursor/skills'/NAME, str(shared), 'https://cursor.com/docs/skills'),
        ('antigravity', 'Antigravity', 'IDE', home/'.gemini/config/skills'/NAME, '', 'https://antigravity.google/docs/skills'),
        ('antigravity:cli', 'Antigravity CLI', 'CLI', home/'.gemini/antigravity-cli/skills'/NAME, '', 'https://antigravity.google/docs/skills'),
        ('dsh', 'DeepSeek Harness', '自定义 Skill 入口', None, '', ''),
        ('shared', '共享 Skill', 'Codex / Cursor', shared, '', 'https://cursor.com/docs/skills'),
    ]
    return [{'id': key, 'name': name, 'client': client, 'path': str(overrides.get(key) or path or ''),
             'shared_path': inherited if key not in overrides else '', 'documentation': docs}
            for key, name, client, path, inherited, docs in definitions]


def entry_path(value, home):
    if not isinstance(value, str) or not value.strip(): raise ValueError('请填写安装入口的完整路径')
    value = value.strip()
    path = home/value[2:] if value.startswith('~/') else Path(value)
    if not path.is_absolute() or path.name != NAME or '..' in path.parts:
        raise ValueError('安装入口应为以 agent-sessions 结尾的绝对路径')
    if any(ord(char) < 32 for char in str(path)): raise ValueError('安装路径不能包含控制字符')
    return path


def physical(path):
    path = Path(path)
    return str(path.parent.resolve()/path.name)
