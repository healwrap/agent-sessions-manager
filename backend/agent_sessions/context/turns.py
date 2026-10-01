"""Turn grouping and stable reference lookup."""
from __future__ import annotations
import re
from typing import Any
from agent_sessions.context.errors import ContextError


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
