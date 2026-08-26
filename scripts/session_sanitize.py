"""Sanitize visible rollout text without hiding ordinary source paths."""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


SECRET_KEY_RE = re.compile(
    r"(?:token|api[_-]?key|authorization|cookie|password|passwd|secret|bsid|sso|session)",
    re.I,
)
LONG_VALUE_RE = re.compile(r"(?<![A-Za-z0-9])[A-Za-z0-9+/_=-]{120,}")
DATA_URL_RE = re.compile(r"^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$", re.I | re.S)


def sanitize_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
    except ValueError:
        return value
    if parsed.scheme not in {"http", "https"}:
        return value
    pairs = []
    for key, item in parse_qsl(parsed.query, keep_blank_values=True):
        pairs.append((key, "[REDACTED]" if SECRET_KEY_RE.search(key) else item))
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(pairs), parsed.fragment))


def sanitize_text(value: str) -> str:
    if not value:
        return ""

    def replace_data(match: re.Match[str]) -> str:
        mime = match.group(1) or "application/octet-stream"
        data = match.group(2)
        digest = hashlib.sha256(data.encode("ascii", "ignore")).hexdigest()[:12]
        return f"[data:{mime};base64 chars={len(data)} sha256={digest}]"

    value = re.sub(r"data:([^;,\s]+)?(?:;[^,\s]*)?;base64,([A-Za-z0-9+/=_-]+)", replace_data, value)
    value = re.sub(
        r"(?i)\b(token|api[_-]?key|authorization|cookie|password|passwd|secret|bsid|ssoid)"
        r"(\s*[\"']?\s*[:=]\s*[\"']?)([^\s,;&\"']+)",
        lambda match: f"{match.group(1)}{match.group(2)}[REDACTED]",
        value,
    )
    value = re.sub(r"https?://[^\s<>\"']+", lambda match: sanitize_url(match.group(0)), value)

    def replace_long_value(match: re.Match[str]) -> str:
        candidate = match.group(0)
        suffix = value[match.end(): match.end() + 12]
        path_markers = ("/Users/", "/src/", "src/", "test/", "docs/", "packages/", "node_modules/", "com/")
        looks_like_path = candidate.startswith("/") or (
            candidate.count("/") >= 2
            and (any(marker in candidate for marker in path_markers) or re.match(r"\.(?:[A-Za-z0-9]{1,8})", suffix))
        )
        if looks_like_path:
            return candidate
        counts = Counter(candidate)
        entropy = -sum((count / len(candidate)) * math.log2(count / len(candidate)) for count in counts.values())
        if entropy < 4.2:
            return candidate
        return f"[LONG_VALUE_REDACTED chars={len(candidate)}]"

    return LONG_VALUE_RE.sub(replace_long_value, value)


def compact_line(value: str, limit: int = 220) -> str:
    value = " ".join(sanitize_text(value).split())
    return value if len(value) <= limit else value[: limit - 1] + "…"


def text_from_content(value: Any, *, skip_binary: bool = True) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        if skip_binary and (
            value.startswith("data:")
            or len(value) > 200_000 and not any(char.isspace() for char in value[:1000])
        ):
            return sanitize_text(value)
        return value
    if isinstance(value, list):
        return "\n".join(filter(None, (text_from_content(item, skip_binary=skip_binary) for item in value)))
    if isinstance(value, dict):
        preferred = []
        for key in ("text", "message", "output", "stdout", "stderr", "content"):
            if key in value:
                preferred.append(text_from_content(value[key], skip_binary=skip_binary))
        if preferred:
            return "\n".join(filter(None, preferred))
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return str(value)
