"""Command parsing and orchestration for context recovery."""
from __future__ import annotations
import argparse
import math
import re
import sys
from agent_sessions.context.artifacts import render_cache, render_evidence, render_media_item, render_media_list
from agent_sessions.context.errors import ContextError, SessionLookupError
from agent_sessions.context.locator import codex_root, locate_sessions, resolve_session
from .policy import DEFAULT_LIMITS, HARD_LIMITS
from .indexing import build_turns, eligible_turns, find_call, find_media, find_message, find_turn, load_index
from .rendering import render_agent, render_agents, render_locate, render_message, render_outline, render_search, render_status, render_tool, render_tools, render_turn


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
    subparsers.add_parser("agents")
    agent = subparsers.add_parser("agent")
    agent.add_argument("agent_id")
    agent.add_argument("--query")
    agent.add_argument("--context", type=int, default=2)
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
        elif command == "agents":
            output = render_agents(index, source, visible)
        elif command == "agent":
            if not 0 <= args.context <= 5:
                raise ContextError("--context 必须在 0-5 之间。")
            output = render_agent(index, source, visible, args.agent_id, args.query, args.context)
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
