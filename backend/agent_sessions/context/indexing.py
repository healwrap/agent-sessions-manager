"""Incremental normalization, indexes, turns and stable history references."""
from __future__ import annotations
import hashlib
import json
import os
import re
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any
from agent_sessions.context.errors import ContextError
from agent_sessions.context.locator import THREAD_ID_RE, cache_path_for, read_session_index, stable_hash
from agent_sessions.context.text import DATA_URL_RE, compact_line, desktop_visible_message, text_from_content
from .policy import ABS_PATH_RE, CMD_STRING_RE, KNOWN_EVENT_TYPES, KNOWN_RESPONSE_TYPES, KNOWN_TOP_LEVEL_TYPES, NESTED_TOOL_RE, PATCH_PATH_RE, SCHEMA_VERSION


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
        cleaned = value[:500]
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
        "input_excerpt": raw_input[:2_500],
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
    searchable = text.replace(r'\"', '"')
    searchable_head = searchable.casefold()
    exit_codes.extend(int(value) for value in re.findall(r"[\"']?exit_code[\"']?\s*[:=]\s*(-?\d+)", searchable, re.I))
    if any(code != 0 for code in exit_codes) or any(flag is False for flag in flags):
        return "error"
    if any(marker in searchable_head for marker in ("script failed", "iserror\":true", "is_error\":true")):
        return "error"
    if "script running with cell id" in searchable_head:
        return "running"
    if exit_codes or any(flag is True for flag in flags):
        return "success"
    if any(marker in searchable_head for marker in ("script completed", "exit_code\":0", "success\":true")):
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

    # Desktop completion events carry visible messages separately from response
    # items. Read only the two explicit message kinds; never flatten all items.
    if entry_type == 'event_msg' and payload_type == 'item_completed':
        item = payload.get('item') or {}
        if not isinstance(item, dict):
            return
        item_type = item.get('type')
        if item_type not in {'UserMessage', 'AgentMessage'}:
            return
        if payload.get('turn_id') and payload['turn_id'] != state.get('turn_id'):
            state['turn_seq'] += 1
            state['turn_id'] = payload['turn_id']
            records.append({'kind': 'turn_start', 'turn_seq': state['turn_seq'], 'turn_id': state['turn_id'],
                            'timestamp': timestamp, 'offset': offset})
        ensure_turn(state, records, timestamp, offset)
        visible = desktop_visible_message(payload)
        if visible is None:
            return
        role, text = visible
        blocks = item.get('content') or []
        if not isinstance(blocks, list):
            blocks = []
        if text:
            duplicate = any(record.get('kind') == 'message' and record.get('turn_seq') == state['turn_seq']
                            and record.get('role') == role and record.get('text') == text
                            and ((item.get('id') and record.get('item_id') == item.get('id')) or
                                 (not record.get('item_id') and record.get('timestamp') == timestamp))
                            for record in records[-10:])
            if not duplicate:
                records.append({'kind': 'message', 'role': role, 'text': text,
                                'phase': 'user' if role == 'user' else item.get('phase') or 'unknown',
                                'item_id': item.get('id'), 'turn_seq': state['turn_seq'],
                                'timestamp': timestamp, 'line_number': line_number})
        if role == 'user':
            for block_index, block in enumerate(blocks):
                if not isinstance(block, dict):
                    continue
                block_type = str(block.get('type', '')).lower()
                media_kind = 'image' if block_type in {'local_image', 'image', 'input_image'} else 'audio' if block_type in {'local_audio', 'audio', 'input_audio'} else None
                if not media_kind:
                    continue
                key = next((key for key in ('path', 'image_url', 'audio_url', 'url', 'data') if key in block), None)
                if key:
                    descriptor = media_descriptor(block[key], media_kind=media_kind, source_field='item.content',
                                                  offset=offset, line_number=line_number, block_index=block_index, value_key=key)
                    if descriptor:
                        descriptor['turn_seq'] = state['turn_seq']
                        records.append(descriptor)
        return

    if entry_type == "session_meta":
        for key in ("id", "cwd", "source", "originator", "timestamp", "cli_version"):
            if payload.get(key) is not None:
                meta[key] = payload.get(key)
        return
    if entry_type == "compacted":
        meta["compactions"] = int(meta.get("compactions", 0)) + 1
        records.append({'kind': 'context_boundary', 'turn_seq': state['turn_seq'],
                        'timestamp': timestamp, 'line_number': line_number,
                        'source_type': 'compacted'})
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
        text = str(payload.get("message", ""))
        duplicate = any(record.get('kind') == 'message' and record.get('role') == 'user'
                        and record.get('item_id') and record.get('timestamp') == timestamp
                        and record.get('text') == text for record in records[-10:])
        if text and not duplicate:
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
        text = str(payload.get("message", ""))
        duplicate = any(record.get('kind') == 'message' and record.get('role') == 'assistant'
                        and record.get('item_id') and record.get('timestamp') == timestamp
                        and record.get('text') == text for record in records[-10:])
        if text and not duplicate:
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
            "input_offset": offset,
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
            "messages": [], "calls": [], "media": [], "boundaries": [],
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
        elif kind == 'context_boundary':
            turn['boundaries'].append(dict(record))

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
        for index, boundary in enumerate(turn['boundaries'], 1):
            boundary['ref'] = f"{prefix}/X{index:02d}"
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
        "parent_call": call,
        "nested_index": nested_index,
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
