"""Parser schema and bounded reading policy shared by the CLI and adapters."""
import re

SCHEMA_VERSION = 9
DEFAULT_LIMITS = {
    "locate": 8_000,
    "status": 2_000,
    "outline": 8_000,
    "search": 8_000,
    "turn": 14_000,
    "message": 8_000,
    "tools": 8_000,
    "tool": 6_000,
    "evidence": 8_000,
    "agents": 8_000,
    "agent": 14_000,
    "media": 6_000,
    "cache": 3_000,
}
HARD_LIMITS = {key: value for key, value in DEFAULT_LIMITS.items()}
NESTED_TOOL_RE = re.compile(r"\btools\.([A-Za-z0-9_]+)\s*\(")
AGENT_ID_RE = re.compile(r"\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b", re.I)
AGENT_TOOL_NAMES = {
    "multi_agent_v1__spawn_agent",
    "multi_agent_v1__send_input",
    "multi_agent_v1__wait_agent",
    "multi_agent_v1__resume_agent",
    "multi_agent_v1__close_agent",
}
PATCH_PATH_RE = re.compile(r"^\*\*\* (?:Add|Update|Delete) File:\s*(.+)$", re.M)
ABS_PATH_RE = re.compile(r"/(?:Users|private|var|tmp|Volumes|opt)/[^\s'\"`;,)}\]]+")
CMD_STRING_RE = re.compile(r"\bcmd\s*:\s*(\"(?:\\.|[^\"\\])*\")", re.S)
KNOWN_TOP_LEVEL_TYPES = {
    "session_meta", "turn_context", "event_msg", "response_item", "compacted",
    "ghost_snapshot", "world_state", "token_usage_record",
}
KNOWN_EVENT_TYPES = {
    "task_started", "task_complete", "turn_aborted", "user_message", "agent_message",
    "agent_reasoning", "token_count", "context_compacted", "thread_name_updated",
    "thread_settings_applied", "patch_apply_end", "web_search_end", "item_completed",
}
KNOWN_RESPONSE_TYPES = {
    "message", "reasoning", "function_call", "custom_tool_call", "function_call_output",
    "custom_tool_call_output", "computer_initialize_state",
}
