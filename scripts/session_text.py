"""Text helpers that preserve source values and only bound presentation."""

from __future__ import annotations

import re
from typing import Any


DATA_URL_RE = re.compile(r"^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$", re.I | re.S)


def desktop_visible_message(payload: dict[str, Any]) -> tuple[str, str] | None:
    """Read only explicit visible Desktop messages, never arbitrary item content."""
    item = payload.get('item')
    if payload.get('type') != 'item_completed' or not isinstance(item, dict):
        return None
    if item.get('type') not in {'UserMessage', 'AgentMessage'}:
        return None
    blocks = item.get('content')
    if not isinstance(blocks, list):
        return None
    text = '\n'.join(str(block.get('text', '')) for block in blocks
                     if isinstance(block, dict) and block.get('type') in {'text', 'Text', 'input_text', 'output_text'})
    return ('user' if item['type'] == 'UserMessage' else 'assistant', text)


def compact_line(value: str, limit: int = 220) -> str:
    """Collapse whitespace for a bounded summary without replacing content values."""
    value = " ".join(value.split())
    return value if len(value) <= limit else value[: limit - 1] + "…"


def text_from_content(value: Any) -> str:
    """Render structured content while retaining every value for evidence lookup."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(text_from_content(item) for item in value)
    if isinstance(value, dict):
        return "\n".join(f"{key}: {text_from_content(item)}" for key, item in value.items())
    return str(value)
