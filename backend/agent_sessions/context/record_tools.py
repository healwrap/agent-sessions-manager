"""Tool input summaries and nested call metadata."""
from __future__ import annotations
import json
from collections import Counter
from typing import Any
from agent_sessions.context.text import compact_line
from .policy import ABS_PATH_RE, CMD_STRING_RE, NESTED_TOOL_RE, PATCH_PATH_RE


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
