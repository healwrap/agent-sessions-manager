"""Normalize supported history records without changing source values."""
from __future__ import annotations
import json
import re
from typing import Any
from agent_sessions.context.text import desktop_visible_message, text_from_content
from .policy import KNOWN_EVENT_TYPES, KNOWN_RESPONSE_TYPES, KNOWN_TOP_LEVEL_TYPES
from .record_tools import tool_summary
from .record_media import media_descriptor, media_from_response


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
