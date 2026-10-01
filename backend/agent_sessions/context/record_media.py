"""Visible media descriptors without reading attachment bytes."""
from __future__ import annotations
import hashlib
from pathlib import Path
from typing import Any
from agent_sessions.context.text import DATA_URL_RE


def media_descriptor(
    value: Any,
    *,
    media_kind: str,
    source_field: str,
    offset: int,
    line_number: int,
    block_index: int | None = None,
    value_key: str | None = None,
) -> dict[str, Any] | None:
    descriptor: dict[str, Any] = {
        "kind": "media",
        "media_kind": media_kind,
        "source_field": source_field,
        "offset": offset,
        "line_number": line_number,
        "block_index": block_index,
        "value_key": value_key,
    }
    if isinstance(value, dict):
        for key in ("image_url", "audio_url", "url", "path", "data"):
            if key in value:
                descriptor["value_key"] = key
                return media_descriptor(
                    value[key],
                    media_kind=media_kind,
                    source_field=source_field,
                    offset=offset,
                    line_number=line_number,
                    block_index=block_index,
                    value_key=key,
                )
        return None
    if not isinstance(value, str) or not value:
        return None
    data_match = DATA_URL_RE.match(value)
    if data_match:
        encoded = data_match.group(2)
        descriptor.update({
            "locator": "embedded",
            "mime": data_match.group(1) or "application/octet-stream",
            "encoded_chars": len(encoded),
            "sha256": hashlib.sha256(encoded.encode("ascii", "ignore")).hexdigest(),
        })
        return descriptor
    if value.startswith(("http://", "https://")):
        descriptor.update({"locator": "remote_url", "url": value})
        return descriptor
    descriptor.update({
        "locator": "local_path",
        "path": value,
        "exists": Path(value).expanduser().exists(),
    })
    return descriptor

def media_from_response(payload: dict[str, Any], offset: int, line_number: int) -> list[dict[str, Any]]:
    results = []
    content = payload.get("content")
    if not isinstance(content, list):
        return results
    for index, block in enumerate(content):
        if not isinstance(block, dict):
            continue
        block_type = str(block.get("type", "")).lower()
        if "image" in block_type:
            kind = "image"
            keys = ("image_url", "url", "path", "data")
        elif "audio" in block_type:
            kind = "audio"
            keys = ("audio_url", "url", "path", "data")
        else:
            continue
        for key in keys:
            if key in block:
                item = media_descriptor(
                    block[key], media_kind=kind, source_field=f"content.{block_type}",
                    offset=offset, line_number=line_number, block_index=index, value_key=key,
                )
                if item:
                    results.append(item)
                break
    return results
