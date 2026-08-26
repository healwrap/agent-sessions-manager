#!/usr/bin/env python3
"""Token-efficient, read-only access to Codex rollout JSONL sessions."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any

from session_artifacts import (
    render_cache,
    render_evidence,
    render_media_item,
    render_media_list,
    snippet_around,
    untrusted_header,
)
from session_errors import ContextError, SessionLookupError
from session_locator import (
    THREAD_ID_RE,
    cache_path_for,
    codex_root,
    locate_sessions,
    read_session_index,
    resolve_session,
    stable_hash,
)
from session_sanitize import DATA_URL_RE, compact_line, sanitize_text, text_from_content


SCHEMA_VERSION = 5
DEFAULT_LIMITS = {
    "locate": 8_000,
    "status": 2_000,
    "outline": 8_000,
    "search": 8_000,
    "turn": 14_000,
    "message": 8_000,
    "tools": 8_000,
    "tool": 6_000,
    "evidence": 8_000,
    "media": 6_000,
    "cache": 3_000,
}
HARD_LIMITS = {key: value for key, value in DEFAULT_LIMITS.items()}
NESTED_TOOL_RE = re.compile(r"\btools\.([A-Za-z0-9_]+)\s*\(")
PATCH_PATH_RE = re.compile(r"^\*\*\* (?:Add|Update|Delete) File:\s*(.+)$", re.M)
ABS_PATH_RE = re.compile(r"/(?:Users|private|var|tmp|Volumes|opt)/[^\s'\"`;,)}\]]+")
CMD_STRING_RE = re.compile(r"\bcmd\s*:\s*(\"(?:\\.|[^\"\\])*\")", re.S)
KNOWN_TOP_LEVEL_TYPES = {
    "session_meta", "turn_context", "event_msg", "response_item", "compacted",
    "ghost_snapshot", "world_state",
}
KNOWN_EVENT_TYPES = {
    "task_started", "task_complete", "turn_aborted", "user_message", "agent_message",
    "agent_reasoning", "token_count", "context_compacted", "thread_name_updated",
    "thread_settings_applied", "patch_apply_end", "web_search_end",
}
KNOWN_RESPONSE_TYPES = {
    "message", "reasoning", "function_call", "custom_tool_call", "function_call_output",
    "custom_tool_call_output", "computer_initialize_state",
}


def prefix_hash(path: Path, length: int) -> str:
    with path.open("rb") as handle:
        return hashlib.sha256(handle.read(length)).hexdigest()


def thread_id_from_path(path: Path) -> str:
    matches = THREAD_ID_RE.findall(path.name)
    return matches[-1] if matches else stable_hash(str(path), 36)


def ensure_turn(state: dict[str, Any], records: list[dict[str, Any]], timestamp: str, offset: int) -> None:
    if state["turn_seq"] == 0:
        state["turn_seq"] = 1
        state["turn_id"] = "implicit-turn-1"
        records.append({
            "kind": "turn_start",
            "turn_seq": 1,
            "turn_id": state["turn_id"],
            "timestamp": timestamp,
            "offset": offset,
        })


def parse_js_string(raw: str) -> str:
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw.strip('"')


def extract_balanced_argument(source: str, open_index: int) -> str | None:
    depth = 0
    quote: str | None = None
    escaped = False
    line_comment = False
    block_comment = False
    index = open_index
    while index < len(source):
        char = source[index]
        next_char = source[index + 1] if index + 1 < len(source) else ""
        if line_comment:
            if char == "\n":
                line_comment = False
            index += 1
            continue
        if block_comment:
            if char == "*" and next_char == "/":
                block_comment = False
                index += 2
            else:
                index += 1
            continue
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            index += 1
            continue
        if char == "/" and next_char == "/":
            line_comment = True
            index += 2
            continue
        if char == "/" and next_char == "*":
            block_comment = True
            index += 2
            continue
        if char in {"'", '"', "`"}:
            quote = char
            index += 1
            continue
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return source[open_index + 1:index]
        index += 1
    return None


def nested_tool_calls(raw_input: str) -> list[dict[str, Any]]:
    calls = []
    for match in NESTED_TOOL_RE.finditer(raw_input):
        argument = extract_balanced_argument(raw_input, match.end() - 1)
        if argument is None:
            continue
        name = match.group(1)
        summary = tool_summary(name, argument, include_nested=False)
        calls.append({
            "name": name,
            "summary": summary["summary"],
            "paths": summary["paths"],
            "input_excerpt": summary["input_excerpt"],
            "input_chars": len(argument),
        })
    return calls


def tool_summary(name: str, raw_input: str, *, include_nested: bool = True) -> dict[str, Any]:
    nested_calls = nested_tool_calls(raw_input) if include_nested else []
    nested = [call["name"] for call in nested_calls]
    counts = Counter(nested)
    display = [f"{key}×{counts[key]}" for key in counts]
    paths = []
    for value in PATCH_PATH_RE.findall(raw_input) + ABS_PATH_RE.findall(raw_input):
        cleaned = sanitize_text(value.rstrip(".:")[:500])
        if cleaned and cleaned not in paths:
            paths.append(cleaned)
    commands = []
    for match in CMD_STRING_RE.finditer(raw_input):
        command = compact_line(parse_js_string(match.group(1)), 240)
        if command and command not in commands:
            commands.append(command)
    if display:
        summary = "; ".join(display)
        if commands:
            summary += " | " + " | ".join(commands[:2])
    elif commands:
        summary = " | ".join(commands[:2])
    else:
        summary = compact_line(raw_input, 360) or name
    return {
        "nested_tools": nested,
        "nested_calls": nested_calls,
        "summary": summary,
        "paths": paths[:20],
        "input_excerpt": sanitize_text(raw_input[:2_500]),
        "input_chars": len(raw_input),
    }


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
        descriptor.update({"locator": "remote_url", "url": sanitize_url(value)})
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


def output_status(output: Any) -> str:
    exit_codes: list[int] = []
    flags: list[bool] = []

    def inspect(value: Any) -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                folded = str(key).casefold()
                if folded in {"exit_code", "exitcode"} and isinstance(item, int):
                    exit_codes.append(item)
                elif folded in {"iserror", "is_error"} and isinstance(item, bool):
                    flags.append(not item)
                elif folded == "success" and isinstance(item, bool):
                    flags.append(item)
                inspect(item)
        elif isinstance(value, list):
            for item in value:
                inspect(item)

    inspect(output)
    text = text_from_content(output)[:10_000]
    head = text.casefold()
    exit_codes.extend(int(value) for value in re.findall(r"[\"']?exit_code[\"']?\s*[:=]\s*(-?\d+)", text, re.I))
    if any(code != 0 for code in exit_codes) or any(flag is False for flag in flags):
        return "error"
    if any(marker in head for marker in ("script failed", "iserror\":true", "is_error\":true")):
        return "error"
    if "script running with cell id" in head:
        return "running"
    if exit_codes or any(flag is True for flag in flags):
        return "success"
    if any(marker in head for marker in ("script completed", "exit_code\":0", "success\":true")):
        return "success"
    return "result"


def note_record_format(meta: dict[str, Any], entry_type: Any, payload_type: Any) -> None:
    entry_name = str(entry_type or "(none)")
    payload_name = str(payload_type or "(none)")
    unknown = False
    if entry_name not in KNOWN_TOP_LEVEL_TYPES:
        unknown = True
    elif entry_name == "event_msg" and payload_name not in KNOWN_EVENT_TYPES:
        unknown = True
    elif entry_name == "response_item":
        generic_tool = payload_name.endswith("_call") or payload_name.endswith("_call_output")
        unknown = payload_name not in KNOWN_RESPONSE_TYPES and not generic_tool
    if unknown:
        key = f"{entry_name}/{payload_name}"
        counts = meta.setdefault("unrecognized_record_types", {})
        counts[key] = int(counts.get(key, 0)) + 1


def normalize_entry(
    entry: dict[str, Any], *, offset: int, raw_len: int, line_number: int,
    state: dict[str, Any], records: list[dict[str, Any]], meta: dict[str, Any],
) -> None:
    timestamp = str(entry.get("timestamp", ""))
    entry_type = entry.get("type")
    payload = entry.get("payload") or {}
    if not isinstance(payload, dict):
        return
    payload_type = payload.get("type")
    note_record_format(meta, entry_type, payload_type)

    if entry_type == "session_meta":
        for key in ("id", "cwd", "source", "originator", "timestamp", "cli_version"):
            if payload.get(key) is not None:
                meta[key] = payload.get(key)
        return
    if entry_type == "compacted":
        meta["compactions"] = int(meta.get("compactions", 0)) + 1
        return
    if entry_type == "event_msg" and payload_type == "task_started":
        state["turn_seq"] += 1
        state["turn_id"] = payload.get("turn_id") or f"turn-{state['turn_seq']}"
        records.append({
            "kind": "turn_start", "turn_seq": state["turn_seq"], "turn_id": state["turn_id"],
            "timestamp": timestamp, "offset": offset,
        })
        return

    if entry_type == "event_msg" and payload_type == "user_message":
        ensure_turn(state, records, timestamp, offset)
        text = sanitize_text(str(payload.get("message", ""))).strip()
        if text:
            records.append({
                "kind": "message", "role": "user", "phase": "user", "text": text,
                "turn_seq": state["turn_seq"], "timestamp": timestamp, "line_number": line_number,
            })
        for field, kind in (("local_images", "image"), ("images", "image"), ("local_audio", "audio"), ("audio", "audio")):
            values = payload.get(field) or []
            if not isinstance(values, list):
                values = [values]
            for value in values:
                item = media_descriptor(
                    value, media_kind=kind, source_field=field, offset=offset, line_number=line_number,
                )
                if item:
                    item["turn_seq"] = state["turn_seq"]
                    records.append(item)
        return

    if entry_type == "event_msg" and payload_type == "agent_message":
        ensure_turn(state, records, timestamp, offset)
        text = sanitize_text(str(payload.get("message", ""))).strip()
        if text:
            records.append({
                "kind": "message", "role": "assistant", "phase": payload.get("phase") or "unknown",
                "text": text, "turn_seq": state["turn_seq"], "timestamp": timestamp,
                "line_number": line_number,
            })
        return

    if entry_type == "event_msg" and payload_type in {"task_complete", "turn_aborted"}:
        ensure_turn(state, records, timestamp, offset)
        records.append({
            "kind": "turn_end", "status": "completed" if payload_type == "task_complete" else "aborted",
            "turn_seq": state["turn_seq"], "timestamp": timestamp,
        })
        return

    if entry_type != "response_item":
        return

    if payload_type == "message" and payload.get("role") == "user":
        ensure_turn(state, records, timestamp, offset)
        for item in media_from_response(payload, offset, line_number):
            item["turn_seq"] = state["turn_seq"]
            records.append(item)
        return

    is_tool_call = payload_type in {"function_call", "custom_tool_call"} or (
        isinstance(payload_type, str) and payload_type.endswith("_call")
    )
    if is_tool_call:
        ensure_turn(state, records, timestamp, offset)
        raw_input = payload.get("arguments")
        if raw_input is None:
            raw_input = payload.get("input")
        if raw_input is None:
            raw_input = {
                key: value for key, value in payload.items()
                if key not in {"type", "name", "call_id", "id", "status"}
            }
        if not isinstance(raw_input, str):
            raw_input = json.dumps(raw_input, ensure_ascii=False, separators=(",", ":"))
        summary = tool_summary(str(payload.get("name") or "unknown"), raw_input)
        records.append({
            "kind": "tool_call", "turn_seq": state["turn_seq"], "timestamp": timestamp,
            "call_id": payload.get("call_id") or payload.get("id") or f"line-{line_number}",
            "outer_name": payload.get("name") or "unknown", "call_type": payload_type,
            "line_number": line_number, **summary,
        })
        return

    is_tool_output = payload_type in {"function_call_output", "custom_tool_call_output"} or (
        isinstance(payload_type, str) and payload_type.endswith("_call_output")
    )
    if is_tool_output:
        ensure_turn(state, records, timestamp, offset)
        output = payload.get("output")
        records.append({
            "kind": "tool_output", "turn_seq": state["turn_seq"], "timestamp": timestamp,
            "call_id": payload.get("call_id") or payload.get("id") or f"line-{line_number}",
            "offset": offset, "raw_len": raw_len, "line_number": line_number,
            "output_chars": len(json.dumps(output, ensure_ascii=False, separators=(",", ":"))),
            "output_blocks": len(output) if isinstance(output, list) else 1,
            "status": output_status(output),
        })


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


def build_turns(index: dict[str, Any]) -> list[dict[str, Any]]:
    turns: dict[int, dict[str, Any]] = {}
    calls_by_id: dict[str, dict[str, Any]] = {}
    for record in index["records"]:
        seq = int(record.get("turn_seq", 0))
        if seq <= 0:
            continue
        turn = turns.setdefault(seq, {
            "seq": seq, "turn_id": None, "timestamp": None, "status": "in_progress",
            "messages": [], "calls": [], "media": [],
        })
        kind = record.get("kind")
        if kind == "turn_start":
            turn["turn_id"] = record.get("turn_id")
            turn["timestamp"] = record.get("timestamp")
        elif kind == "message":
            turn["messages"].append(dict(record))
        elif kind == "tool_call":
            call = dict(record)
            turn["calls"].append(call)
            calls_by_id[str(call.get("call_id"))] = call
        elif kind == "tool_output":
            call = calls_by_id.get(str(record.get("call_id")))
            if call is not None:
                call["output"] = dict(record)
        elif kind == "media":
            media = dict(record)
            if media.get("locator") == "local_path":
                candidate = next((
                    item for item in turn["media"]
                    if item.get("media_kind") == media.get("media_kind")
                    and item.get("locator") == "embedded"
                    and not item.get("original_path")
                ), None)
                if candidate:
                    candidate["original_path"] = media.get("path")
                    candidate["original_path_exists"] = media.get("exists")
                    continue
            turn["media"].append(media)
        elif kind == "turn_end":
            turn["status"] = record.get("status", "completed")

    ordered = [turns[key] for key in sorted(turns)]
    for turn in ordered:
        prefix = f"T{turn['seq']:03d}"
        for index, message in enumerate(turn["messages"], 1):
            message["ref"] = f"{prefix}/{'U' if message['role'] == 'user' else 'A'}{index:02d}"
        for index, call in enumerate(turn["calls"], 1):
            call["ref"] = f"{prefix}/C{index:03d}"
            for nested_index, nested in enumerate(call.get("nested_calls") or [], 1):
                nested["ref"] = f"{call['ref']}.{nested_index}"
                nested["parent_ref"] = call["ref"]
        for index, media in enumerate(turn["media"], 1):
            media["ref"] = f"{prefix}/M{index:02d}"
    return ordered


def eligible_turns(turns: list[dict[str, Any]], include_incomplete: bool) -> list[dict[str, Any]]:
    return turns if include_incomplete else [turn for turn in turns if turn["status"] != "in_progress"]


def parse_turn_ref(value: str) -> int:
    match = re.fullmatch(r"T?(\d+)", value.strip(), re.I)
    if not match:
        raise ContextError(f"无效 turn 引用：{value}")
    return int(match.group(1))


def find_turn(turns: list[dict[str, Any]], value: str, include_incomplete: bool) -> dict[str, Any]:
    seq = parse_turn_ref(value)
    for turn in turns:
        if turn["seq"] == seq:
            if turn["status"] == "in_progress" and not include_incomplete:
                raise ContextError(f"T{seq:03d} 尚未完成；明确需要时加 --include-incomplete。")
            return turn
    raise ContextError(f"找不到 T{seq:03d}。")


def find_message(turns: list[dict[str, Any]], value: str, include_incomplete: bool) -> tuple[dict[str, Any], dict[str, Any]]:
    match = re.fullmatch(r"T?(\d+)/(U|A)(\d+)", value.strip(), re.I)
    if not match:
        raise ContextError(f"无效消息引用：{value}")
    turn = find_turn(turns, match.group(1), include_incomplete)
    wanted = f"T{turn['seq']:03d}/{match.group(2).upper()}{int(match.group(3)):02d}"
    for message in turn["messages"]:
        if message.get("ref", "").upper() == wanted.upper():
            return turn, message
    raise ContextError(f"找不到 {value}。")


def find_call(turns: list[dict[str, Any]], value: str, include_incomplete: bool) -> tuple[dict[str, Any], dict[str, Any]]:
    match = re.fullmatch(r"T?(\d+)/C(\d+)(?:\.(\d+))?", value.strip(), re.I)
    if not match:
        raise ContextError(f"无效工具引用：{value}")
    turn = find_turn(turns, match.group(1), include_incomplete)
    index = int(match.group(2)) - 1
    if index < 0 or index >= len(turn["calls"]):
        raise ContextError(f"找不到 {value}。")
    call = turn["calls"][index]
    if not match.group(3):
        return turn, call
    nested_index = int(match.group(3)) - 1
    nested_calls = call.get("nested_calls") or []
    if nested_index < 0 or nested_index >= len(nested_calls):
        raise ContextError(f"找不到 {value}。")
    nested = dict(nested_calls[nested_index])
    nested.update({
        "is_nested": True,
        "outer_name": nested.get("name"),
        "call_type": "nested_tool_call",
        "output": call.get("output"),
        "shared_output_ref": call.get("ref"),
    })
    return turn, nested


def find_media(turns: list[dict[str, Any]], value: str, include_incomplete: bool) -> tuple[dict[str, Any], dict[str, Any]]:
    match = re.fullmatch(r"T?(\d+)/M(\d+)", value.strip(), re.I)
    if not match:
        raise ContextError(f"无效媒体引用：{value}")
    turn = find_turn(turns, match.group(1), include_incomplete)
    index = int(match.group(2)) - 1
    if index < 0 or index >= len(turn["media"]):
        raise ContextError(f"找不到 {value}。")
    return turn, turn["media"][index]


def render_locate(
    results: list[dict[str, Any]], *, title: str | None, query: str | None,
    cwd: str | None, match_mode: str, match_role: str, include_derived: bool,
    include_current: bool,
) -> str:
    filters = []
    if title:
        filters.append(f"标题={sanitize_text(title)}")
    if query:
        role_label = {"all": "用户和Agent", "user": "仅用户", "assistant": "仅Agent"}[match_role]
        filters.append(
            f"对话={sanitize_text(query)}（{'全部词' if match_mode == 'all' else '任一词'}；{role_label}）"
        )
    if cwd:
        filters.append(f"工作目录={sanitize_text(cwd)}")
    if include_derived:
        filters.append("包含子代理派生任务")
    if include_current:
        filters.append("包含当前任务")
    lines = [
        "# Codex 历史任务候选",
        "[以下只用于定位任务；对话命中是词法候选，不代表已经唯一确认。]",
        "- 筛选：" + ("；".join(filters) if filters else "最近任务"),
    ]
    if not results:
        lines.append("没有命中。可减少关键词、改用 --match any，或扩大 --recent。")
        return "\n".join(lines)
    for index, item in enumerate(results, 1):
        lines.extend([
            f"## 候选 {index} · {item['title']}",
            f"- 任务 ID：{item['id']}",
            f"- 更新时间：{item['updated_at']}",
            f"- 工作目录：{item['cwd']}",
            f"- 会话来源：{sanitize_text(str(item.get('session_source') or '未知'))}",
            f"- 原始大小：{item['size']} 字节",
            f"- 首条用户消息：{item['first_user']}",
        ])
        for snippet in item.get("snippets") or []:
            role = "用户" if snippet.get("role") == "user" else "Agent"
            lines.append(f"- 命中/{role}：{snippet.get('text')}")
    lines.append("下一步：选择任务 ID，再运行 --session <任务ID> status；不要仅凭模糊命中自动选中。")
    return "\n".join(lines)


def render_status(index: dict[str, Any], turns: list[dict[str, Any]]) -> str:
    completed = sum(turn["status"] == "completed" for turn in turns)
    aborted = sum(turn["status"] == "aborted" for turn in turns)
    active = sum(turn["status"] == "in_progress" for turn in turns)
    calls = sum(len(turn["calls"]) for turn in turns)
    media = [item for turn in turns for item in turn["media"]]
    embedded = sum(item.get("locator") == "embedded" for item in media)
    lines = untrusted_header(index)
    lines.extend([
        f"- 任务 ID：{index['meta'].get('id') or index['thread_id']}",
        f"- turn：完成 {completed}，中止 {aborted}，进行中 {active}",
        f"- 工具调用：{calls}",
        f"- 媒体：{len(media)}（可恢复嵌入媒体 {embedded}）",
        f"- 压缩记录：{index['meta'].get('compactions', 0)}",
        f"- 索引：{index.get('indexed_lines', 0)} 行 / {index.get('indexed_offset', 0)} 字节",
    ])
    unknown = index.get("meta", {}).get("unrecognized_record_types") or {}
    if unknown:
        total = sum(int(value) for value in unknown.values())
        names = "、".join(list(unknown)[:5])
        lines.append(f"- 格式警告：有 {total} 条未识别记录（{names}）；相关内容可能未被索引")
    else:
        lines.append("- 格式检查：未发现未知记录类型")
    lines.append("下一步：运行 outline，或用 search 搜索当前问题关键词。")
    return "\n".join(lines)


def last_agent_summary(turn: dict[str, Any]) -> str:
    agents = [message for message in turn["messages"] if message["role"] == "assistant"]
    finals = [message for message in agents if message.get("phase") == "final_answer"]
    selected = finals[-1] if finals else (agents[-1] if agents else None)
    summary = compact_line(selected["text"], 220) if selected else "(无 Agent 可见结论)"
    if turn.get("status") == "aborted":
        return "[中止轮次，非最终结论] " + summary
    return summary


def first_user_summary(turn: dict[str, Any]) -> str:
    selected = next((message for message in turn["messages"] if message["role"] == "user"), None)
    return compact_line(selected["text"], 180) if selected else "(无用户消息)"


def display_tool_counts(turn: dict[str, Any]) -> str:
    counts = Counter()
    for call in turn["calls"]:
        names = call.get("nested_tools") or [call.get("outer_name", "unknown")]
        counts.update(names)
    return ", ".join(f"{name}×{count}" for name, count in counts.items()) or "无"


def render_outline(index: dict[str, Any], turns: list[dict[str, Any]], page: int, page_size: int) -> str:
    total_pages = max(1, math.ceil(len(turns) / page_size))
    if page < 1 or page > total_pages:
        raise ContextError(f"页码超出范围；有效范围 1-{total_pages}。")
    selected = turns[(page - 1) * page_size: page * page_size]
    lines = untrusted_header(index)
    lines.append(f"## 对话目录（第 {page}/{total_pages} 页）")
    for turn in selected:
        ref = f"T{turn['seq']:03d}"
        lines.extend([
            f"### {ref} · {turn['status']}",
            f"- 用户：{first_user_summary(turn)}",
            f"- Agent：{last_agent_summary(turn)}",
            f"- 工具：{display_tool_counts(turn)}",
            f"- 媒体：{len(turn['media'])}",
        ])
    lines.append("继续：search <关键词>；或 turn Txxx。")
    return "\n".join(lines)


def render_search(index: dict[str, Any], turns: list[dict[str, Any]], query: str, limit: int) -> str:
    query = query.strip()
    if len(query) < 2:
        raise ContextError("搜索词至少需要 2 个字符。")
    terms = [term.casefold() for term in query.split() if term]
    ranked = []
    for turn in turns:
        for message in turn["messages"]:
            folded = message["text"].casefold()
            hits = sum(folded.count(term) for term in terms)
            if hits:
                ranked.append((hits, turn["seq"], message))
    ranked.sort(key=lambda item: (-item[0], -item[1]))
    lines = untrusted_header(index)
    lines.append(f"## 搜索：{sanitize_text(query)}")
    if not ranked:
        lines.append("未在用户/Agent 可见对话中命中。请换一个更短的业务词；工具结果不会被此命令搜索。")
        return "\n".join(lines)
    for hits, _, message in ranked[:limit]:
        label = "用户" if message["role"] == "user" else f"Agent/{message.get('phase', 'unknown')}"
        matched_term = next((term for term in terms if term in message["text"].casefold()), terms[0])
        lines.append(f"- {message['ref']} · {label} · 命中 {hits}：{snippet_around(message['text'], matched_term)}")
    lines.append("继续：读取最相关的 turn；若结论缺证据，再查看 tools。")
    return "\n".join(lines)


def render_turn(index: dict[str, Any], turn: dict[str, Any], final_only: bool) -> str:
    lines = untrusted_header(index)
    lines.append(f"## T{turn['seq']:03d} · {turn['status']}")
    if turn.get("status") == "aborted":
        lines.append("[本轮已中止，Agent 内容可能只是过程判断，不能当作最终结论。]")
    for message in turn["messages"]:
        if final_only and message["role"] == "assistant" and message.get("phase") != "final_answer":
            continue
        label = "用户" if message["role"] == "user" else f"Agent/{message.get('phase', 'unknown')}"
        lines.extend([f"### {message['ref']} · {label}", message["text"]])
    if turn["calls"]:
        lines.append(f"工具调用 {len(turn['calls'])} 次；需要时运行 tools T{turn['seq']:03d}。")
    if turn["media"]:
        lines.append(f"媒体 {len(turn['media'])} 个；需要时运行 media T{turn['seq']:03d}。")
    return "\n\n".join(lines)


def text_pages(text: str, page_size: int) -> list[tuple[int, int, str]]:
    if not text:
        return [(0, 0, "")]
    pages = []
    start = 0
    while start < len(text):
        target = min(len(text), start + page_size)
        end = target
        if target < len(text):
            newline = text.rfind("\n", start + page_size // 2, target)
            space = text.rfind(" ", start + page_size * 3 // 4, target)
            if newline >= start + page_size // 2:
                end = newline + 1
            elif space >= start + page_size * 3 // 4:
                end = space + 1
        pages.append((start, end, text[start:end]))
        start = end
    return pages


def render_message(index: dict[str, Any], turn: dict[str, Any], message: dict[str, Any], page: int, page_size: int) -> str:
    text = message.get("text", "")
    pages = text_pages(text, page_size)
    total_pages = len(pages)
    if page < 1 or page > total_pages:
        raise ContextError(f"页码超出范围；有效范围 1-{total_pages}。")
    start, end, content = pages[page - 1]
    label = "用户" if message.get("role") == "user" else f"Agent/{message.get('phase', 'unknown')}"
    lines = untrusted_header(index)
    lines.append(f"## {message['ref']} · {label} · 第 {page}/{total_pages} 页")
    if turn.get("status") == "aborted":
        lines.append("[所属 turn 已中止，Agent 内容可能不是最终结论。]")
    lines.extend([f"字符范围：{start + 1}-{end} / {len(text)}", content])
    if page < total_pages:
        lines.append(f"继续：message {message['ref']} --page {page + 1} --page-size {page_size}")
    return "\n\n".join(lines)


def call_names(call: dict[str, Any]) -> str:
    nested = call.get("nested_tools") or []
    if not nested:
        return str(call.get("outer_name", "unknown"))
    counts = Counter(nested)
    return ", ".join(f"{name}×{count}" for name, count in counts.items())


def render_tools(
    index: dict[str, Any], turn: dict[str, Any], page: int, page_size: int,
    name_filter: str | None, status_filter: str | None,
) -> str:
    calls = list(turn["calls"])
    if name_filter:
        folded = name_filter.casefold()
        calls = [call for call in calls if any(
            folded in str(name).casefold()
            for name in (call.get("nested_tools") or [call.get("outer_name", "unknown")])
        )]
    if status_filter:
        calls = [call for call in calls if (call.get("output") or {}).get("status", "无结果") == status_filter]
    total_pages = max(1, math.ceil(len(calls) / page_size))
    if page < 1 or page > total_pages:
        raise ContextError(f"页码超出范围；有效范围 1-{total_pages}。")
    selected = calls[(page - 1) * page_size: page * page_size]
    lines = untrusted_header(index)
    filters = []
    if name_filter:
        filters.append(f"name={sanitize_text(name_filter)}")
    if status_filter:
        filters.append(f"status={status_filter}")
    suffix = f"；筛选 {'、'.join(filters)}" if filters else ""
    lines.append(f"## T{turn['seq']:03d} 工具清单（不含结果，第 {page}/{total_pages} 页{suffix}）")
    if not calls:
        lines.append("没有符合条件的工具调用。")
        return "\n".join(lines)
    for call in selected:
        output = call.get("output") or {}
        lines.extend([
            f"### {call['ref']} · {call_names(call)} · {output.get('status', '无结果')}",
            f"- 摘要：{call.get('summary') or '(无)'}",
            f"- 输入：{call.get('input_chars', 0)} 字符；结果：{output.get('output_chars', 0)} 字符 / {output.get('output_blocks', 0)} 块",
        ])
        if call.get("paths"):
            lines.append("- 文件：" + "、".join(call["paths"][:6]))
        nested = call.get("nested_calls") or []
        if len(nested) > 1:
            lines.append("- 内部调用：")
            for item in nested:
                lines.append(f"  - {item['ref']} · {item['name']} · {item.get('summary') or '(无摘要)'}")
    if page < total_pages:
        command = f"tools T{turn['seq']:03d} --page {page + 1} --page-size {page_size}"
        if name_filter:
            command += f" --name {name_filter}"
        if status_filter:
            command += f" --status {status_filter}"
        lines.append("下一页：" + command)
    lines.append("继续：tool Txxx/Cxxx[.n] 查看脱敏输入；evidence Txxx/Cxxx[.n] --query <关键词> 定向读结果。")
    return "\n".join(lines)


def render_tool(index: dict[str, Any], call: dict[str, Any]) -> str:
    output = call.get("output") or {}
    lines = untrusted_header(index)
    lines.extend([
        f"## {call['ref']} · {call_names(call)}",
        f"- 外层类型：{call.get('call_type')} / {call.get('outer_name')}",
        f"- 状态：{output.get('status', '无结果')}",
        f"- 输入大小：{call.get('input_chars', 0)} 字符",
        f"- 结果大小：{output.get('output_chars', 0)} 字符 / {output.get('output_blocks', 0)} 块",
    ])
    if call.get("is_nested"):
        lines.append(f"- 结果归属：与外层 {call.get('shared_output_ref')} 共享，历史格式无法可靠拆成单次内部调用结果")
    if call.get("paths"):
        lines.append("- 文件：\n" + "\n".join(f"  - {path}" for path in call["paths"][:20]))
    lines.extend(["### 脱敏输入摘要", call.get("input_excerpt") or "(无)"])
    lines.append("结果未读取。需要时使用 evidence 并指定查询词。")
    return "\n".join(lines)


def emit(command: str, value: str, requested: int | None, show_stats: bool, source_size: int) -> None:
    hard = HARD_LIMITS[command]
    limit = min(requested or DEFAULT_LIMITS[command], hard)
    limit = max(500, limit)
    if len(value) > limit:
        omitted = len(value) - limit
        hints = {
            "turn": "请改用 message <消息引用> 分页读取",
            "tools": "请使用 --page、--name 或 --status 缩小范围",
            "evidence": "请使用更精确的查询词",
        }
        hint = hints.get(command, "请缩小读取范围或查询词")
        value = value[: max(0, limit - 100)].rstrip() + f"\n\n[输出已按安全上限截断，省略 {omitted} 字符；{hint}。]"
    print(value)
    if show_stats:
        output_chars = len(value)
        estimated_tokens = math.ceil(output_chars / 4)
        ratio = (output_chars / source_size * 100) if source_size else 0
        source_label = "命中候选会话合计" if command == "locate" else "原始会话"
        print(
            f"\n[粗略统计：本次输出 {output_chars} 字符，约 {estimated_tokens} tokens；"
            f"{source_label} {source_size} 字节，本次输出约占 {ratio:.3f}%]"
        )


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="安全、分层读取 Codex 历史上下文")
    parser.add_argument("--session", default="current", help="current、任务 ID、标题或 JSONL 路径")
    parser.add_argument("--include-incomplete", action="store_true", help="明确包含尚未完成的 turn")
    parser.add_argument("--max-chars", type=int, help="降低单次输出上限；不能超过内置硬上限")
    parser.add_argument("--stats", action="store_true", help="显示本次输出规模和粗略 token 估算")
    subparsers = parser.add_subparsers(dest="command", required=True)
    locate = subparsers.add_parser("locate")
    locate.add_argument("--title", help="按标题精确或包含匹配")
    locate.add_argument("--query", help="在用户与 Agent 可见对话中匹配关键词")
    locate.add_argument("--cwd", help="按历史工作目录包含匹配")
    locate.add_argument("--match", choices=("all", "any"), default="all", help="多关键词全部命中或任一命中")
    locate.add_argument("--role", choices=("all", "user", "assistant"), default="all", help="限定内容命中的消息角色")
    locate.add_argument("--include-derived", action="store_true", help="内容检索时包含子代理派生任务")
    locate.add_argument("--include-current", action="store_true", help="内容检索时包含当前任务")
    locate.add_argument("--recent", type=int, default=100, help="最多检查最近多少个任务，范围 1-500")
    locate.add_argument("--limit", type=int, default=10, help="最多返回多少个候选，范围 1-20")
    subparsers.add_parser("status")
    outline = subparsers.add_parser("outline")
    outline.add_argument("--page", type=int, default=1)
    outline.add_argument("--page-size", type=int, default=10)
    search = subparsers.add_parser("search")
    search.add_argument("query")
    search.add_argument("--limit", type=int, default=8)
    turn = subparsers.add_parser("turn")
    turn.add_argument("turn")
    turn.add_argument("--final-only", action="store_true")
    message = subparsers.add_parser("message")
    message.add_argument("message")
    message.add_argument("--page", type=int, default=1)
    message.add_argument("--page-size", type=int, default=5_000, help="每页字符数，范围 500-7000")
    tools = subparsers.add_parser("tools")
    tools.add_argument("turn")
    tools.add_argument("--page", type=int, default=1)
    tools.add_argument("--page-size", type=int, default=15)
    tools.add_argument("--name", help="按外层或内部工具名筛选")
    tools.add_argument("--status", choices=("success", "error", "running", "result", "无结果"))
    tool = subparsers.add_parser("tool")
    tool.add_argument("call")
    evidence = subparsers.add_parser("evidence")
    evidence.add_argument("call")
    evidence.add_argument("--query", required=True)
    evidence.add_argument("--context", type=int, default=2)
    media = subparsers.add_parser("media")
    media.add_argument("ref", nargs="?")
    media.add_argument("--extract", action="store_true")
    cache = subparsers.add_parser("cache")
    cache.add_argument("action", nargs="?", choices=("status", "clear"), default="status")
    cache.add_argument("--media", action="store_true", help="clear 时同时删除本任务已提取的媒体副本")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = make_parser()
    args = parser.parse_args(argv)
    try:
        if args.max_chars is not None and args.max_chars <= 0:
            raise ContextError("--max-chars 必须为正数。")
        root = codex_root()
        if args.command == "locate":
            if not 1 <= args.recent <= 500:
                raise ContextError("--recent 必须在 1-500 之间。")
            if not 1 <= args.limit <= 20:
                raise ContextError("--limit 必须在 1-20 之间。")
            results = locate_sessions(
                root, title=args.title, query=args.query, cwd=args.cwd, limit=args.limit,
                recent=args.recent, match_mode=args.match, match_role=args.role,
                include_derived=args.include_derived, include_current=args.include_current,
            )
            output = render_locate(
                results, title=args.title, query=args.query, cwd=args.cwd,
                match_mode=args.match, match_role=args.role, include_derived=args.include_derived,
                include_current=args.include_current,
            )
            source_size = sum(int(item.get("size", 0)) for item in results)
            emit("locate", output, args.max_chars, args.stats, source_size)
            return 0
        source, title_hint = resolve_session(args.session, root)
        index = load_index(source, root, title_hint)
        turns = build_turns(index)
        visible = eligible_turns(turns, args.include_incomplete)
        command = args.command
        if command == "status":
            output = render_status(index, turns)
        elif command == "outline":
            if not 1 <= args.page_size <= 20:
                raise ContextError("--page-size 必须在 1-20 之间。")
            output = render_outline(index, visible, args.page, args.page_size)
        elif command == "search":
            output = render_search(index, visible, args.query, min(max(args.limit, 1), 20))
        elif command == "turn":
            output = render_turn(index, find_turn(turns, args.turn, args.include_incomplete), args.final_only)
        elif command == "message":
            if not 500 <= args.page_size <= 7_000:
                raise ContextError("--page-size 必须在 500-7000 个字符之间。")
            turn_item, message_item = find_message(turns, args.message, args.include_incomplete)
            output = render_message(index, turn_item, message_item, args.page, args.page_size)
        elif command == "tools":
            if not 1 <= args.page_size <= 50:
                raise ContextError("--page-size 必须在 1-50 之间。")
            output = render_tools(
                index, find_turn(turns, args.turn, args.include_incomplete), args.page,
                args.page_size, args.name, args.status,
            )
        elif command == "tool":
            _, call = find_call(turns, args.call, args.include_incomplete)
            output = render_tool(index, call)
        elif command == "evidence":
            if not 0 <= args.context <= 5:
                raise ContextError("--context 必须在 0-5 之间。")
            _, call = find_call(turns, args.call, args.include_incomplete)
            output = render_evidence(index, source, call, args.query, args.context)
        elif command == "media":
            if args.extract and not args.ref:
                raise ContextError("--extract 必须指定一个媒体引用，例如 T003/M01。")
            if not args.ref:
                output = render_media_list(index, visible)
            elif re.fullmatch(r"T?\d+", args.ref, re.I):
                if args.extract:
                    raise ContextError("不能批量提取整个 turn；请指定单个 Txxx/Mxx。")
                output = render_media_list(index, [find_turn(turns, args.ref, args.include_incomplete)])
            else:
                _, item = find_media(turns, args.ref, args.include_incomplete)
                output = render_media_item(index, source, item, root, args.extract)
        elif command == "cache":
            if args.media and args.action != "clear":
                raise ContextError("--media 只能与 cache clear 一起使用。")
            output = render_cache(index, source, root, args.action, args.media)
        else:
            raise ContextError(f"不支持的命令：{command}")
        emit(command, output, args.max_chars, args.stats, int(index.get("indexed_offset", 0)))
        return 0
    except (ContextError, SessionLookupError, OSError) as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
