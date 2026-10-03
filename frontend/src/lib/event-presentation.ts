import { kindLabels, type Event } from './types';
import { recordType } from './record-presentation';
export function eventLabel(event?: Event) {
  const type = event && recordType(event);
  if (type === 'compaction') return ['已压缩', 'compacted'];
  if (type === 'system_prompt' || type === 'tool_definitions')
    return ['系统', 'systemNeutral'];
  if (type === 'execution_result') return ['执行结果', 'toolAmber'];
  return kindLabels[event?.kind || ''] || ['消息', 'systemNeutral'];
}
export function assistantWaitRatio(event: Event) {
  if (
    event.kind !== 'assistant' ||
    !event.first_token_at ||
    !event.completed_at ||
    !event.timestamp
  )
    return null;
  const start = Date.parse(event.timestamp),
    first = Date.parse(event.first_token_at),
    end = Date.parse(event.completed_at);
  if (![start, first, end].every(Number.isFinite) || end <= start) return null;
  return Math.max(0, Math.min(100, ((first - start) / (end - start)) * 100));
}
