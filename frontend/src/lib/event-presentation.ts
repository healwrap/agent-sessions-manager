import { kindLabels, type Event } from './types';
export function eventLabel(event?: Event) {
  if (
    event?.kind === 'context' &&
    ['系统提示词', '工具定义'].includes(event.name)
  )
    return ['系统', 'systemNeutral'];
  if (event?.name === '执行结果' || event?.name === '执行记录')
    return ['执行结果', 'toolAmber'];
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
