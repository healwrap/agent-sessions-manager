"""Bounded tool metadata and raw evidence access."""
from __future__ import annotations
import json
import math
from collections import Counter
from pathlib import Path
from typing import Any
from agent_sessions.context.artifacts import read_raw_entry, untrusted_header
from agent_sessions.context.errors import ContextError
from agent_sessions.context.text import compact_line, text_from_content


def call_names(call: dict[str, Any]) -> str:
    nested = call.get("nested_tools") or []
    if not nested:
        return str(call.get("outer_name", "unknown"))
    counts = Counter(nested)
    return ", ".join(f"{name}×{count}" for name, count in counts.items())

def raw_call_input(source: Path, call: dict[str, Any]) -> tuple[Any, str]:
    offset = call.get("input_offset")
    if offset is None:
        return None, str(call.get("input_excerpt") or "")
    entry = read_raw_entry(source, int(offset))
    payload = entry.get("payload") or {}
    raw = payload.get("arguments")
    if raw is None:
        raw = payload.get("input")
    if raw is None:
        raw = {
            key: value for key, value in payload.items()
            if key not in {"type", "name", "call_id", "id", "status"}
        }
    if isinstance(raw, str):
        try:
            return json.loads(raw), raw
        except json.JSONDecodeError:
            return None, raw
    return raw, json.dumps(raw, ensure_ascii=False, separators=(",", ":"))

def raw_call_output(source: Path, call: dict[str, Any]) -> tuple[Any, str]:
    output_meta = call.get("output") or {}
    offset = output_meta.get("offset")
    if offset is None:
        return None, ""
    entry = read_raw_entry(source, int(offset))
    payload = entry.get("payload") or {}
    output = payload.get("output")
    return output, text_from_content(output)

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
        filters.append(f"name={compact_line(name_filter)}")
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
    lines.append("继续：tool Txxx/Cxxx[.n] 查看有界输入片段；evidence Txxx/Cxxx[.n] --query <关键词> 定向读结果。")
    return "\n".join(lines)

def render_tool(index: dict[str, Any], call: dict[str, Any]) -> str:
    output = call.get("output") or {}
    lines = untrusted_header(index)
    lines.extend([
        f"## {call['ref']} · {call_names(call)}",
        f"- 外层类型：{call.get('call_type')} / {call.get('outer_name')}",
        f"- 状态：{'独立结果未读取' if call.get('is_nested') else output.get('status', '无结果')}",
        f"- 输入大小：{call.get('input_chars', 0)} 字符",
        f"- {'组合结果' if call.get('is_nested') else '结果'}大小：{output.get('output_chars', 0)} 字符 / {output.get('output_blocks', 0)} 块",
    ])
    if call.get("is_nested"):
        lines.append(f"- 结果归属：关联组合调用 {call.get('shared_output_ref')}；evidence 按需匹配独立结果，不沿用组合调用的状态")
    if call.get("paths"):
        lines.append("- 文件：\n" + "\n".join(f"  - {path}" for path in call["paths"][:20]))
    lines.extend(["### 输入片段（保留原值，按上限截取）", call.get("input_excerpt") or "(无)"])
    lines.append("结果未读取。需要时使用 evidence 并指定查询词。")
    return "\n".join(lines)
