"""Recorded child-agent activity views."""
from __future__ import annotations
import re
from pathlib import Path
from typing import Any
from agent_sessions.context.artifacts import evidence_windows, untrusted_header
from agent_sessions.context.errors import ContextError
from agent_sessions.context.text import compact_line
from .policy import AGENT_ID_RE, AGENT_TOOL_NAMES
from .tool_rendering import raw_call_input, raw_call_output


def agent_operation_names(call: dict[str, Any]) -> list[str]:
    names = call.get("nested_tools") or [call.get("outer_name", "unknown")]
    return [str(name) for name in names if str(name) in AGENT_TOOL_NAMES]

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
