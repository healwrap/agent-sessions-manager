"""Incremental normalization, indexes, turns and stable history references."""
from __future__ import annotations
import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any
from agent_sessions.context.locator import THREAD_ID_RE, cache_path_for, read_session_index, stable_hash
from .policy import SCHEMA_VERSION
from .record_normalizer import normalize_entry


def prefix_hash(path: Path, length: int) -> str:
    with path.open("rb") as handle:
        return hashlib.sha256(handle.read(length)).hexdigest()

def thread_id_from_path(path: Path) -> str:
    matches = THREAD_ID_RE.findall(path.name)
    return matches[-1] if matches else stable_hash(str(path), 36)

def load_index(source: Path, root: Path, title_hint: str | None) -> dict[str, Any]:
    thread_id = thread_id_from_path(source)
    cache_path = cache_path_for(source, root, thread_id)
    stat = source.stat()
    data: dict[str, Any] | None = None
    if cache_path.exists():
        try:
            loaded = json.loads(cache_path.read_text(encoding="utf-8"))
            fingerprint_len = int(loaded.get("fingerprint_len", -1))
            valid = (
                loaded.get("schema_version") == SCHEMA_VERSION
                and loaded.get("source") == str(source.resolve())
                and 0 <= fingerprint_len <= stat.st_size
                and loaded.get("prefix_hash") == prefix_hash(source, fingerprint_len)
                and int(loaded.get("indexed_offset", 0)) <= stat.st_size
            )
            if valid:
                data = loaded
        except (OSError, ValueError, TypeError):
            data = None
    if data is None:
        fingerprint_len = min(stat.st_size, 65_536)
        data = {
            "schema_version": SCHEMA_VERSION,
            "source": str(source.resolve()),
            "thread_id": thread_id,
            "fingerprint_len": fingerprint_len,
            "prefix_hash": prefix_hash(source, fingerprint_len),
            "indexed_offset": 0,
            "indexed_lines": 0,
            "records": [],
            "meta": {"compactions": 0},
            "state": {"turn_seq": 0, "turn_id": None},
        }

    records = data["records"]
    state = data["state"]
    meta = data["meta"]
    line_number = int(data.get("indexed_lines", 0))
    with source.open("rb") as handle:
        handle.seek(int(data["indexed_offset"]))
        while True:
            offset = handle.tell()
            raw = handle.readline()
            if not raw:
                break
            if not raw.endswith(b"\n"):
                handle.seek(offset)
                break
            line_number += 1
            try:
                entry = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            if isinstance(entry, dict):
                normalize_entry(
                    entry, offset=offset, raw_len=len(raw), line_number=line_number,
                    state=state, records=records, meta=meta,
                )
        data["indexed_offset"] = handle.tell()
    data["indexed_lines"] = line_number
    data["source_size"] = stat.st_size
    data["source_mtime_ns"] = stat.st_mtime_ns
    if title_hint:
        meta["title"] = title_hint
    if not meta.get("title"):
        for row in read_session_index(root):
            if row.get("id") == meta.get("id", thread_id):
                meta["title"] = row.get("thread_name")
    cache_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    cache_path.parent.chmod(0o700)
    fd, temp_name = tempfile.mkstemp(prefix=".session-index-", dir=cache_path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))
        os.chmod(temp_name, 0o600)
        os.replace(temp_name, cache_path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)
    return data

from .record_tools import parse_js_string, extract_balanced_argument, nested_tool_calls, tool_summary

from .record_media import media_descriptor, media_from_response

from .record_normalizer import ensure_turn, output_status, note_record_format, normalize_entry

from .turns import build_turns, eligible_turns, parse_turn_ref, find_turn, find_message, find_call, find_media
