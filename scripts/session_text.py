"""Text helpers that preserve source values and only bound presentation."""

from __future__ import annotations

import re
from typing import Any


DATA_URL_RE = re.compile(r"^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$", re.I | re.S)


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
