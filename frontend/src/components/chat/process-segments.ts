import type { Event } from '../../lib/types';

export type ProcessSegment =
  { kind: 'group'; events: Event[] } | { kind: 'response'; event: Event };

// Harness groups reasoning and tools until an assistant response, independently
// of request boundaries and display preferences. A mixed message has two seats.
export function processSegments(events: Event[], reasoningEvent?: Event) {
  const segments: ProcessSegment[] = [];
  let pending: Event[] = [];
  const flush = () => {
    if (pending.length) segments.push({ kind: 'group', events: pending });
    pending = [];
  };
  for (const event of events) {
    if (event.kind !== 'assistant') {
      pending.push(event);
      continue;
    }
    if (event.has_reasoning || event.phase === 'reasoning') pending.push(event);
    if (
      event.phase !== 'reasoning' &&
      event.phase !== 'tool_calls' &&
      event.preview.trim() &&
      event.preview !== '（仅工具调用）'
    ) {
      flush();
      segments.push({ kind: 'response', event });
    }
  }
  if (reasoningEvent) pending.push(reasoningEvent);
  flush();
  return segments;
}
