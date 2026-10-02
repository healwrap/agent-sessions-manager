import type { Event } from './types';

// Old saved views may predate the semantic field; keep compatibility here only.
export function recordType(event: Event): string {
  return (
    event.record_type ||
    (
      {
        系统提示词: 'system_prompt',
        工具定义: 'tool_definitions',
        上下文压缩: 'compaction',
        执行记录: 'execution_result',
        执行结果: 'execution_result',
      } as Record<string, string>
    )[event.name] ||
    (
      {
        user: 'user_message',
        assistant: 'assistant_message',
        tool: 'tool_call',
        subtool: 'subtool_call',
        context: 'context_message',
        media: 'attachment',
      } as Record<string, string>
    )[event.kind] ||
    'context_message'
  );
}
