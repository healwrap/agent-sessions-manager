"""Small argument-derived summaries shared by source plugins."""
import json
from agent_sessions.context.text import compact_line


def argument_summary(raw):
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        return ''
    if not isinstance(value, dict): return ''
    # Descriptions and paths are native argument values, never result guesses.
    for key in ('description', 'query', 'queries', 'pattern', 'url', 'file_path', 'path', 'AbsolutePath', 'command', 'cmd', 'CommandLine'):
        text = value.get(key)
        if isinstance(text, list):
            text = ' · '.join(item for item in text if isinstance(item, str))
        if isinstance(text, str) and text: return compact_line(text.split('\n')[0], 420)
    return ''
