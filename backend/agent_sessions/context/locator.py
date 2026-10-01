"""Locate Codex rollout sessions by id, title, metadata, or visible dialogue text."""

from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any, Iterable

from agent_sessions.context.errors import SessionLookupError
from agent_sessions.context.text import compact_line, desktop_visible_message


THREAD_ID_RE = re.compile(r"([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})", re.I)


def codex_root() -> Path:
    override = os.environ.get("RECOVER_CODEX_CONTEXT_HOME")
    if override:
        return Path(override).expanduser()
    configured = os.environ.get("CODEX_HOME")
    return Path(configured).expanduser() if configured else Path.home() / ".codex"


def stable_hash(value: str, length: int = 12) -> str:
    return hashlib.sha256(value.encode("utf-8", "replace")).hexdigest()[:length]


def cache_path_for(source: Path, root: Path, thread_id: str) -> Path:
    return root / "session-context-index" / f"{thread_id}-{stable_hash(str(source.resolve()), 8)}.json"


def read_session_index(root: Path) -> list[dict[str, Any]]:
    path = root / "session_index.jsonl"
    rows = []
    if not path.exists():
        return rows
    with path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row, dict) and row.get("id"):
                rows.append(row)
    return rows


def unique_session_rows(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: dict[str, dict[str, Any]] = {}
    for row in rows:
        current = unique.get(str(row["id"]))
        if current is None or str(row.get("updated_at", "")) >= str(current.get("updated_at", "")):
            unique[str(row["id"])] = row
    return sorted(unique.values(), key=lambda row: str(row.get("updated_at", "")), reverse=True)


def candidate_session_files(root: Path, thread_id: str) -> list[Path]:
    matches = []
    for base in (root / "sessions", root / "archived_sessions"):
        if base.exists():
            matches.extend(base.rglob(f"*{thread_id}*.jsonl"))
    return sorted(matches, key=lambda path: path.stat().st_mtime_ns, reverse=True)


def read_session_meta(path: Path) -> dict[str, Any]:
    with path.open("rb") as handle:
        for _ in range(200):
            raw = handle.readline()
            if not raw:
                break
            if b'"session_meta"' not in raw:
                continue
            try:
                entry = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            payload = entry.get("payload") if isinstance(entry, dict) else None
            if isinstance(payload, dict):
                return {
                    key: payload.get(key)
                    for key in ("id", "cwd", "timestamp", "cli_version", "source", "originator")
                    if payload.get(key) is not None
                }
    return {}


def visible_messages(path: Path) -> Iterable[tuple[str, str]]:
    with path.open("rb") as handle:
        for raw in handle:
            if b'"event_msg"' not in raw:
                continue
            is_user = b'"user_message"' in raw
            is_agent = b'"agent_message"' in raw
            is_desktop = b'"item_completed"' in raw
            if not is_user and not is_agent and not is_desktop:
                continue
            try:
                entry = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            payload = entry.get("payload") if isinstance(entry, dict) else None
            if not isinstance(payload, dict):
                continue
            payload_type = payload.get("type")
            if payload_type == 'item_completed':
                visible = desktop_visible_message(payload)
                if visible and visible[1]:
                    yield visible
                continue
            if payload_type not in {"user_message", "agent_message"}:
                continue
            text = str(payload.get("message", ""))
            if text:
                yield ("user" if payload_type == "user_message" else "assistant", text)


def normalized_search(value: str) -> str:
    return re.sub(r"[\W_]+", "", value.casefold(), flags=re.UNICODE)


def query_terms(query: str) -> list[str]:
    return [term.casefold() for term in query.split() if len(normalized_search(term)) >= 2]


def message_hits(text: str, terms: list[str]) -> tuple[set[str], int, str | None]:
    folded = text.casefold()
    compact = normalized_search(text)
    matched = set()
    total = 0
    first = None
    for term in terms:
        direct = folded.count(term)
        compact_term = normalized_search(term)
        fuzzy = compact.count(compact_term) if not direct and compact_term else 0
        count = direct or fuzzy
        if count:
            matched.add(term)
            total += count
            if first is None:
                first = term
    return matched, total, first


def snippet_for(text: str, term: str | None, limit: int = 260) -> str:
    if not term:
        return compact_line(text, limit)
    folded = text.casefold()
    position = folded.find(term)
    if position < 0:
        return compact_line(text, limit)
    radius = max(40, (limit - len(term)) // 2)
    start = max(0, position - radius)
    end = min(len(text), position + len(term) + radius)
    return compact_line(("…" if start else "") + text[start:end] + ("…" if end < len(text) else ""), limit)


def scan_dialogue(path: Path, terms: list[str], match_mode: str, match_role: str = "all") -> dict[str, Any]:
    first_user = None
    matched_terms: set[str] = set()
    score = 0
    snippets = []
    for role, text in visible_messages(path):
        if role == "user" and first_user is None:
            first_user = compact_line(text, 180)
        if not terms:
            continue
        if match_role != "all" and role != match_role:
            continue
        matched, count, first = message_hits(text, terms)
        if not matched:
            continue
        matched_terms.update(matched)
        score += count * (3 if role == "user" else 1)
        if len(snippets) < 2:
            snippets.append({"role": role, "text": snippet_for(text, first)})
    eligible = not terms or (
        matched_terms == set(terms) if match_mode == "all" else bool(matched_terms)
    )
    return {
        "eligible": eligible,
        "score": score,
        "first_user": first_user or "(无用户可见消息)",
        "matched_terms": sorted(matched_terms),
        "snippets": snippets,
    }


def session_descriptor(row: dict[str, Any], root: Path, *, with_first_user: bool = False) -> dict[str, Any] | None:
    files = candidate_session_files(root, str(row["id"]))
    if not files:
        return None
    source = files[0].resolve()
    meta = read_session_meta(source)
    session_source = meta.get("source")
    subagent = session_source.get("subagent") if isinstance(session_source, dict) else None
    spawn = subagent.get("thread_spawn") if isinstance(subagent, dict) else None
    derived = isinstance(subagent, dict)
    if derived:
        parent = spawn.get("parent_thread_id") if isinstance(spawn, dict) else None
        source_label = f"subagent{f'，父任务 {parent}' if parent else ''}"
    else:
        source_label = str(session_source or meta.get("originator") or "未知")
    descriptor = {
        "id": str(row["id"]),
        "title": str(row.get("thread_name") or "(无标题)"),
        "updated_at": str(row.get("updated_at") or meta.get("timestamp") or "未知"),
        "cwd": str(meta.get("cwd") or "未知"),
        "session_source": source_label,
        "derived": derived,
        "source": source,
        "size": source.stat().st_size,
    }
    if with_first_user:
        descriptor.update(scan_dialogue(source, [], "all"))
    return descriptor


def locate_sessions(
    root: Path, *, title: str | None, query: str | None, cwd: str | None,
    limit: int, recent: int, match_mode: str, match_role: str,
    include_derived: bool, include_current: bool,
) -> list[dict[str, Any]]:
    rows = unique_session_rows(read_session_index(root))
    if title:
        folded_title = title.casefold()
        exact = [row for row in rows if str(row.get("thread_name", "")).casefold() == folded_title]
        rows = exact or [row for row in rows if folded_title in str(row.get("thread_name", "")).casefold()]
    rows = rows[:recent]
    terms = query_terms(query or "")
    if query and not terms:
        raise SessionLookupError("内容查询至少需要一个 2 字符以上的关键词。")
    results = []
    current_id = os.environ.get("CODEX_THREAD_ID", "").strip()
    for row in rows:
        if current_id and str(row["id"]) == current_id and not include_current and not title:
            continue
        descriptor = session_descriptor(row, root)
        if descriptor is None:
            continue
        if descriptor.get("derived") and not include_derived and not title:
            continue
        if cwd and cwd.casefold() not in descriptor["cwd"].casefold():
            continue
        dialogue = scan_dialogue(descriptor["source"], terms, match_mode, match_role)
        if not dialogue["eligible"]:
            continue
        descriptor.update(dialogue)
        results.append(descriptor)
    results.sort(key=lambda item: (int(item.get("score", 0)), item.get("updated_at", "")), reverse=True)
    return results[:limit]


def duplicate_preview(rows: list[dict[str, Any]], root: Path) -> str:
    lines = []
    for row in rows[:8]:
        item = session_descriptor(row, root, with_first_user=True)
        if item is None:
            continue
        lines.append(
            f"- {item['title']} | {item['updated_at']} | cwd={item['cwd']} | {item['id']}\n"
            f"  首条用户消息：{item['first_user']}"
        )
    return "\n".join(lines)


def resolve_session(selector: str, root: Path) -> tuple[Path, str | None]:
    selector = selector.strip()
    supplied = Path(selector).expanduser()
    if supplied.is_file():
        return supplied.resolve(), None

    rows = read_session_index(root)
    if selector == "current":
        selector = os.environ.get("CODEX_THREAD_ID", "").strip()
        if not selector:
            raise SessionLookupError(
                "当前环境没有 CODEX_THREAD_ID；请用 --session 提供任务 ID，或先运行 locate 找候选。"
            )

    exact_id = [row for row in rows if row.get("id") == selector]
    if THREAD_ID_RE.fullmatch(selector) or exact_id:
        matches = candidate_session_files(root, selector)
        if not matches:
            raise SessionLookupError(f"找不到任务 ID {selector} 的本地会话文件。")
        title = exact_id[-1].get("thread_name") if exact_id else None
        return matches[0].resolve(), title

    folded = selector.casefold()
    exact_title = [row for row in rows if str(row.get("thread_name", "")).casefold() == folded]
    matches_by_title = exact_title or [
        row for row in rows if folded in str(row.get("thread_name", "")).casefold()
    ]
    candidates = unique_session_rows(matches_by_title)
    if len(candidates) != 1:
        if not candidates:
            raise SessionLookupError(
                f"没有找到标题匹配 {selector!r} 的任务。可运行 locate --query <记得的对话词>。"
            )
        raise SessionLookupError(
            "标题匹配到多个任务，请根据时间、工作目录或首条用户消息选择任务 ID：\n"
            + duplicate_preview(candidates, root)
        )
    row = candidates[0]
    files = candidate_session_files(root, str(row["id"]))
    if not files:
        raise SessionLookupError(f"索引中有任务 {row['id']}，但本地 JSONL 文件不存在。")
    return files[0].resolve(), row.get("thread_name")
