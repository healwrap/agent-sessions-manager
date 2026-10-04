import type { Event } from './types';
import { positionOf } from './selectors';
export function timelineRange(
  event: Event,
  total: number,
  duration: boolean,
): [number, number] {
  if (duration) {
    const start = positionOf(event, total, true);
    return [start, event.timeline_end ?? start];
  }
  // Sequence projection allocates one equal interval per visible record.
  const count = Math.max(1, total);
  const position = event.timeline_position ?? event.position;
  return [position / count, (position + (event.count ?? 1)) / count];
}
export function nearestTimelineEvent(
  events: Event[],
  point: number,
  total: number,
  duration: boolean,
) {
  let nearest: Event | undefined,
    distance = Infinity;
  for (const event of events) {
    const [start, end] = timelineRange(event, total, duration);
    const gap = Math.max(start - point, point - end, 0);
    if (gap < distance) {
      distance = gap;
      nearest = event;
    }
  }
  return nearest;
}
