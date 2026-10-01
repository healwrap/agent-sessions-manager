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
  // DSH's sequence projection allocates one equal interval per ledger record.
  // Aggregated overview markers occupy all of the records they represent.
  const count = Math.max(1, total);
  return [
    event.position / count,
    ((event.end_position ?? event.position) + 1) / count,
  ];
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
