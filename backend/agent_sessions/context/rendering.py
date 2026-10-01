"""Bounded plain text views for the context recovery CLI."""
from __future__ import annotations
import json
import math
import re
from collections import Counter
from pathlib import Path
from typing import Any
from agent_sessions.context.artifacts import evidence_windows, read_raw_entry, snippet_around, untrusted_header
from agent_sessions.context.errors import ContextError
from agent_sessions.context.text import compact_line, text_from_content
from .policy import AGENT_ID_RE, AGENT_TOOL_NAMES


def render_locate(
    results: list[dict[str, Any]], *, title: str | None, query: str | None,
    cwd: str | None, match_mode: str, match_role: str, include_derived: bool,
    include_current: bool,
) -> str:
    filters = []
    if title:
        filters.append(f"标题={compact_line(title)}")
    if query:
        role_label = {"all": "用户和Agent", "user": "仅用户", "assistant": "仅Agent"}[match_role]
        filters.append(
            f"对话={compact_line(query)}（{'全部词' if match_mode == 'all' else '任一词'}；{role_label}）"
        )
    if cwd:
        filters.append(f"工作目录={compact_line(cwd)}")
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
            f"- 会话来源：{compact_line(str(item.get('session_source') or '未知'))}",
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
    lines.append(f"## 搜索：{compact_line(query)}")
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

def agent_operation_names(call: dict[str, Any]) -> list[str]:
    names = call.get("nested_tools") or [call.get("outer_name", "unknown")]
    return [str(name) for name in names if str(name) in AGENT_TOOL_NAMES]

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

def agent_activity(source: Path, turns: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Collect only the child-agent data that was recorded in the parent rollout."""
    registry: dict[str, dict[str, Any]] = {}
    for turn in turns:
        for call in turn.get("calls") or []:
            operations = agent_operation_names(call)
            if not operations:
                continue
            _, input_text = raw_call_input(source, call)
            _, output_text = raw_call_output(source, call)
            searchable = "\n".join((input_text, output_text))
            agent_ids = sorted(set(AGENT_ID_RE.findall(searchable)), key=str.casefold)
            if not agent_ids:
                continue
            nickname_match = re.search(
                r"[\"']nickname[\"']\s*[:=]\s*[\"']([^\"']+)", output_text,
            )
            nickname = nickname_match.group(1) if nickname_match else None
            for agent_id in agent_ids:
                item = registry.setdefault(agent_id, {"nickname": None, "events": []})
                if nickname:
                    item["nickname"] = nickname
                item["events"].append({
                    "turn": f"T{turn['seq']:03d}",
                    "call": call.get("ref", "(无引用)"),
                    "operations": operations,
                    "input": compact_line(input_text, 600),
                    "output": output_text,
                    "output_chars": len(output_text),
                })
    return registry

def agent_state(events: list[dict[str, Any]]) -> str:
    state = "已记录"
    for event in events:
        operations = event.get("operations") or []
        output = str(event.get("output") or "").casefold()
        if "multi_agent_v1__close_agent" in operations:
            state = "已关闭"
        elif "multi_agent_v1__resume_agent" in operations:
            state = "已恢复"
        elif "completed" in output:
            state = "已完成"
        elif "errored" in output:
            state = "异常"
        elif "running" in output:
            state = "运行中"
    return state

def render_agents(index: dict[str, Any], source: Path, turns: list[dict[str, Any]]) -> str:
    registry = agent_activity(source, turns)
    lines = untrusted_header(index)
    lines.append("## 子代理记录（主任务 rollout 中可恢复的部分）")
    lines.append("[这里只展示主任务已经收到的子代理事件和结果；不代表存在完整子代理 transcript。]")
    if not registry:
        lines.append("没有找到可恢复的 multi_agent_v1 子代理记录。")
        return "\n".join(lines)
    for agent_id, item in registry.items():
        nickname = f" · {compact_line(item['nickname'])}" if item.get("nickname") else ""
        refs = ", ".join(event["call"] for event in item["events"])
        has_output = any(event.get("output") for event in item["events"])
        lines.extend([
            f"### {agent_id}{nickname}",
            f"- 状态：{agent_state(item['events'])}",
            f"- 事件：{len(item['events'])} 次（{refs}）",
            f"- 主任务已记录结果：{'是' if has_output else '否'}",
        ])
    lines.append("继续：agent <agent-id>；可加 --query <关键词> 定向读取已回传结果。")
    return "\n".join(lines)

def render_agent(
    index: dict[str, Any], source: Path, turns: list[dict[str, Any]],
    selector: str, query: str | None, context: int,
) -> str:
    registry = agent_activity(source, turns)
    matches = [agent_id for agent_id in registry if agent_id.casefold().startswith(selector.casefold())]
    if not matches:
        raise ContextError(f"没有找到子代理 {selector}；先运行 agents 查看当前任务中可恢复的 agent。")
    if len(matches) > 1:
        raise ContextError("agent 前缀匹配到多个子代理，请提供完整 agent_id：" + ", ".join(matches))
    agent_id = matches[0]
    item = registry[agent_id]
    nickname = f" · {compact_line(item['nickname'])}" if item.get("nickname") else ""
    lines = untrusted_header(index)
    lines.extend([
        f"## 子代理 {agent_id}{nickname}",
        f"- 状态：{agent_state(item['events'])}",
        "[以下是主任务 rollout 已保存的输入摘要和工具结果；未保存的子代理内部对话无法恢复。]",
    ])
    search_query = query or agent_id
    for event in item["events"]:
        lines.extend([
            f"### {event['turn']}/{event['call']} · {', '.join(event['operations'])}",
            f"- 输入摘要：{event['input'] or '(无)'}",
        ])
        output = str(event.get("output") or "")
        if not output:
            lines.append("- 结果：主任务没有保存该调用的结果。")
            continue
        windows = evidence_windows(output, search_query, context)
        if not windows and query:
            lines.append("- 结果：没有命中查询词。")
        elif windows:
            lines.append("- 已记录结果：")
            lines.extend(windows)
        else:
            lines.append("- 结果：已保存，但没有可展示的命中片段。")
    lines.append("注意：这不是对子代理隐藏推理或未回传消息的读取。")
    return "\n".join(lines)

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
