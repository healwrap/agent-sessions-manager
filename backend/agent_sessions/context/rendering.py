"""Bounded plain text views for the context recovery CLI."""
from __future__ import annotations
import math
from collections import Counter
from typing import Any
from agent_sessions.context.artifacts import snippet_around, untrusted_header
from agent_sessions.context.errors import ContextError
from agent_sessions.context.text import compact_line


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

from .tool_rendering import call_names, raw_call_input, raw_call_output, render_tools, render_tool

from .agent_rendering import agent_operation_names, agent_activity, agent_state, render_agents, render_agent
