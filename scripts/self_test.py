#!/usr/bin/env python3
"""Self-test for the recover-codex-context parser and safety boundaries."""

from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


SCRIPT = Path(__file__).with_name("session_context.py")
THREAD_ID = "11111111-2222-3333-4444-555555555555"
SECOND_THREAD_ID = "66666666-7777-8888-9999-aaaaaaaaaaaa"
THIRD_THREAD_ID = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff"


def entry(timestamp: str, entry_type: str, payload: dict) -> str:
    return json.dumps({"timestamp": timestamp, "type": entry_type, "payload": payload}, ensure_ascii=False)


def run(
    root: Path, session: Path | str, *args: str, expect: int = 0,
    current_id: str | None = None,
) -> str:
    env = os.environ.copy()
    env["RECOVER_CODEX_CONTEXT_HOME"] = str(root)
    if current_id:
        env["CODEX_THREAD_ID"] = current_id
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--session", str(session), *args],
        text=True, capture_output=True, env=env, check=False,
    )
    if result.returncode != expect:
        raise AssertionError(f"command {args} returned {result.returncode}: {result.stderr}\n{result.stdout}")
    return result.stdout + result.stderr


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="recover-context-test-") as temp:
        root = Path(temp) / "codex"
        session_dir = root / "sessions" / "2026" / "08" / "13"
        session_dir.mkdir(parents=True)
        session = session_dir / f"rollout-test-{THREAD_ID}.jsonl"
        image_bytes = b"\x89PNG\r\n\x1a\nself-test-image"
        image_data = base64.b64encode(image_bytes).decode("ascii")
        audio_bytes = b"RIFFself-test-audio"
        audio_data = base64.b64encode(audio_bytes).decode("ascii")
        long_path = "/Users/test/workspace/project/src/main/java/com/example/really/long/package/name/with/many/segments/for/context/recovery/Example.java"
        long_answer = "结论：" + ("余额差异来自字段映射；" * 700)
        rows = [
            entry("2026-08-13T00:00:00Z", "session_meta", {"id": THREAD_ID, "cwd": "/tmp/project"}),
            entry("2026-08-13T00:00:01Z", "event_msg", {"type": "task_started", "turn_id": "turn-one"}),
            entry("2026-08-13T00:00:02Z", "response_item", {
                "type": "message", "role": "user", "content": [
                    {"type": "input_text", "text": "请分析余额差异"},
                    {"type": "input_image", "image_url": f"data:image/png;base64,{image_data}", "detail": "high"},
                    {"type": "input_audio", "audio_url": f"data:audio/wav;base64,{audio_data}"},
                ],
            }),
            entry("2026-08-13T00:00:03Z", "event_msg", {
                "type": "user_message", "message": "请分析余额差异", "images": [],
                "local_images": ["/tmp/expired-image.png"], "audio": [],
                "local_audio": ["/tmp/expired-audio.wav"],
            }),
            entry("2026-08-13T00:00:04Z", "event_msg", {
                "type": "agent_message", "phase": "commentary", "message": "我先检查两个仓库。",
            }),
            entry("2026-08-13T00:00:05Z", "response_item", {
                "type": "custom_tool_call", "name": "exec", "call_id": "call-one",
                "input": "const a = await tools.exec_command({cmd: \"rg balance /tmp/project\"}); const b = await tools.apply_patch(\"*** Begin Patch\\n*** Update File: /tmp/project/a.ts\\n*** End Patch\"); text(a);",
            }),
            entry("2026-08-13T00:00:06Z", "response_item", {
                "type": "custom_tool_call_output", "call_id": "call-one", "output": [
                    {"type": "text", "text": "Script completed\nWall time 0.1 seconds"},
                    {"type": "text", "text": "balance marker found\ntoken=very-secret-token-value\n/tmp/project/a.ts:10"},
                    {"type": "text", "text": json.dumps({
                        "backend_files": f"{long_path}\n/tmp/project/short.ts",
                        "token": "another-secret-value",
                    })},
                ],
            }),
            entry("2026-08-13T00:00:06.1Z", "response_item", {
                "type": "function_call", "name": "exec_command", "call_id": "call-two",
                "arguments": json.dumps({"cmd": "false", "workdir": "/tmp/project"}),
            }),
            entry("2026-08-13T00:00:06.2Z", "response_item", {
                "type": "function_call_output", "call_id": "call-two", "output": [
                    {"type": "text", "text": json.dumps({"exit_code": 7, "output": "boom"})},
                ],
            }),
            entry("2026-08-13T00:00:07Z", "event_msg", {
                "type": "agent_message", "phase": "final_answer", "message": long_answer,
            }),
            entry("2026-08-13T00:00:08Z", "event_msg", {"type": "task_complete", "turn_id": "turn-one"}),
            entry("2026-08-13T00:00:09Z", "compacted", {"replacement_history": [{"type": "message", "role": "developer", "content": "noise"}]}),
            entry("2026-08-13T00:00:09.1Z", "future_record", {"type": "mystery"}),
            entry("2026-08-13T00:00:10Z", "event_msg", {"type": "task_started", "turn_id": "turn-two"}),
            entry("2026-08-13T00:00:11Z", "event_msg", {
                "type": "user_message", "message": "这一轮尚未完成", "images": [], "local_images": [],
            }),
        ]
        session.write_text("\n".join(rows) + "\n", encoding="utf-8")
        second_session = session_dir / f"rollout-test-{SECOND_THREAD_ID}.jsonl"
        second_rows = [
            entry("2026-08-12T00:00:00Z", "session_meta", {
                "id": SECOND_THREAD_ID, "cwd": "/tmp/other-project",
            }),
            entry("2026-08-12T00:00:01Z", "event_msg", {
                "type": "task_started", "turn_id": "other-turn",
            }),
            entry("2026-08-12T00:00:02Z", "event_msg", {
                "type": "user_message", "message": "讨论另外一个缓存清理问题",
            }),
            entry("2026-08-12T00:00:03Z", "event_msg", {
                "type": "agent_message", "phase": "final_answer", "message": "缓存候选任务结论。",
            }),
            entry("2026-08-12T00:00:04Z", "event_msg", {
                "type": "task_complete", "turn_id": "other-turn",
            }),
        ]
        second_session.write_text("\n".join(second_rows) + "\n", encoding="utf-8")
        third_session = session_dir / f"rollout-test-{THIRD_THREAD_ID}.jsonl"
        third_rows = [
            entry("2026-08-11T00:00:00Z", "session_meta", {
                "id": THIRD_THREAD_ID,
                "cwd": "/tmp/project",
                "source": {"subagent": {"thread_spawn": {"parent_thread_id": THREAD_ID}}},
            }),
            entry("2026-08-11T00:00:01Z", "event_msg", {
                "type": "task_started", "turn_id": "derived-turn",
            }),
            entry("2026-08-11T00:00:02Z", "event_msg", {
                "type": "user_message", "message": "余额字段映射派生测试",
            }),
            entry("2026-08-11T00:00:03Z", "event_msg", {
                "type": "task_complete", "turn_id": "derived-turn",
            }),
        ]
        third_session.write_text("\n".join(third_rows) + "\n", encoding="utf-8")
        (root / "session_index.jsonl").write_text(
            "\n".join([
                json.dumps({
                    "id": THREAD_ID, "thread_name": "自测会话", "updated_at": "2026-08-13T00:00:11Z",
                }, ensure_ascii=False),
                json.dumps({
                    "id": SECOND_THREAD_ID, "thread_name": "自测会话", "updated_at": "2026-08-12T00:00:04Z",
                }, ensure_ascii=False),
                json.dumps({
                    "id": THIRD_THREAD_ID, "thread_name": "派生会话", "updated_at": "2026-08-11T00:00:03Z",
                }, ensure_ascii=False),
            ]) + "\n",
            encoding="utf-8",
        )

        duplicate = run(root, "自测会话", "status", expect=2)
        assert "标题匹配到多个任务" in duplicate and THREAD_ID in duplicate and SECOND_THREAD_ID in duplicate
        assert "cwd=/tmp/project" in duplicate and "cwd=/tmp/other-project" in duplicate
        located = run(root, session, "locate", "--title", "自测会话")
        assert THREAD_ID in located and SECOND_THREAD_ID in located and "首条用户消息" in located
        by_content = run(root, session, "locate", "--query", "余额 字段映射")
        assert THREAD_ID in by_content and SECOND_THREAD_ID not in by_content and THIRD_THREAD_ID not in by_content
        assert "命中/" in by_content
        with_derived = run(
            root, session, "locate", "--query", "余额 字段映射", "--include-derived",
        )
        assert THREAD_ID in with_derived and THIRD_THREAD_ID in with_derived and "包含子代理派生任务" in with_derived
        without_current = run(
            root, session, "locate", "--query", "余额 字段映射", current_id=THREAD_ID,
        )
        assert THREAD_ID not in without_current and "没有命中" in without_current
        with_current = run(
            root, session, "locate", "--query", "余额 字段映射", "--include-current",
            current_id=THREAD_ID,
        )
        assert THREAD_ID in with_current and "包含当前任务" in with_current
        user_only = run(root, session, "locate", "--query", "字段映射", "--role", "user")
        assert THREAD_ID not in user_only and "没有命中" in user_only
        agent_only = run(root, session, "locate", "--query", "字段映射", "--role", "assistant")
        assert THREAD_ID in agent_only and "命中/Agent" in agent_only
        by_other_content = run(root, session, "locate", "--query", "缓存清理")
        assert SECOND_THREAD_ID in by_other_content and THREAD_ID not in by_other_content
        by_cwd = run(root, session, "locate", "--cwd", "other-project")
        assert SECOND_THREAD_ID in by_cwd and THREAD_ID not in by_cwd

        status = run(root, session, "status")
        assert "完成 1" in status and "进行中 1" in status and "压缩记录：1" in status
        assert "格式警告" in status and "future_record/mystery" in status
        stats = run(root, session, "--stats", "status")
        assert "粗略统计" in stats and "tokens" in stats
        outline = run(root, session, "outline")
        assert "T001" in outline and "T002" not in outline and "余额差异" in outline
        search = run(root, session, "search", "字段映射")
        assert "T001" in search and "T002" not in search
        turn = run(root, session, "turn", "T001")
        assert "请分析余额差异" in turn and "结论：余额差异" in turn and "developer" not in turn
        first_page = run(root, session, "message", "T001/A03", "--page", "1", "--page-size", "700")
        second_page = run(root, session, "message", "T001/A03", "--page", "2", "--page-size", "700")
        assert "第 1/" in first_page and "--page 2" in first_page and "第 2/" in second_page
        tools = run(root, session, "tools", "T001")
        assert "exec_command×1" in tools and "apply_patch×1" in tools
        assert "T001/C001.1" in tools and "T001/C001.2" in tools
        assert "very-secret-token-value" not in tools and "balance marker found" not in tools
        tools_page = run(root, session, "tools", "T001", "--page-size", "1")
        assert "第 1/2 页" in tools_page and "--page 2" in tools_page
        error_tools = run(root, session, "tools", "T001", "--status", "error")
        assert "T001/C002" in error_tools and "T001/C001" not in error_tools
        tool = run(root, session, "tool", "T001/C001")
        assert "/tmp/project/a.ts" in tool and "结果未读取" in tool
        nested_tool = run(root, session, "tool", "T001/C001.1")
        assert "结果归属" in nested_tool and "exec_command" in nested_tool
        evidence = run(root, session, "evidence", "T001/C001", "--query", "balance marker")
        assert "balance marker found" in evidence and "very-secret-token-value" not in evidence
        assert "[REDACTED]" in evidence
        structured = run(root, session, "evidence", "T001/C001", "--query", "Example.java")
        assert long_path in structured and "another-secret-value" not in structured
        nested_evidence = run(root, session, "evidence", "T001/C001.1", "--query", "balance marker")
        assert "共享结果" in nested_evidence and "不能证明" in nested_evidence
        media = run(root, session, "media", "T001")
        assert "T001/M01" in media and "T001/M02" in media and "嵌入 JSONL" in media
        assert image_data not in media and audio_data not in media and "原临时路径 已失效" in media
        extracted = run(root, session, "media", "T001/M01", "--extract")
        location = extracted.split("可用位置：", 1)[1].splitlines()[0]
        assert Path(location).read_bytes() == image_bytes
        extracted_audio = run(root, session, "media", "T001/M02", "--extract")
        audio_location = extracted_audio.split("可用位置：", 1)[1].splitlines()[0]
        assert Path(audio_location).read_bytes() == audio_bytes
        cache_status = run(root, session, "cache", "status")
        assert "脱敏索引：存在" in cache_status and "已提取媒体：2 个" in cache_status
        blocked = run(root, session, "turn", "T002", expect=2)
        assert "--include-incomplete" in blocked
        complete = run(root, session, "--include-incomplete", "turn", "T002")
        assert "这一轮尚未完成" in complete
        capped = run(root, session, "--max-chars", "500", "turn", "T001")
        assert len(capped) <= 520

        with session.open("a", encoding="utf-8") as handle:
            handle.write(entry("2026-08-13T00:00:12Z", "event_msg", {
                "type": "agent_message", "phase": "final_answer", "message": "第二轮完成。",
            }) + "\n")
            handle.write(entry("2026-08-13T00:00:13Z", "event_msg", {
                "type": "task_complete", "turn_id": "turn-two",
            }) + "\n")
        refreshed = run(root, session, "status")
        assert "完成 2" in refreshed and "进行中 0" in refreshed
        with session.open("a", encoding="utf-8") as handle:
            handle.write(entry("2026-08-13T00:00:14Z", "event_msg", {
                "type": "task_started", "turn_id": "turn-three",
            }) + "\n")
            handle.write(entry("2026-08-13T00:00:15Z", "event_msg", {
                "type": "agent_message", "phase": "commentary", "message": "这不是最终结论。",
            }) + "\n")
            handle.write(entry("2026-08-13T00:00:16Z", "event_msg", {
                "type": "turn_aborted", "turn_id": "turn-three",
            }) + "\n")
        aborted = run(root, session, "turn", "T003")
        assert "本轮已中止" in aborted and "不能当作最终结论" in aborted
        cleared = run(root, session, "cache", "clear", "--media")
        assert "脱敏索引" in cleared and "已提取媒体" in cleared and session.exists()

    print("self-test: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
