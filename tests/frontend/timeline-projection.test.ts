import { expect, it } from 'vitest';
import type { Event } from '../../frontend/src/lib/types';
import {
  timelineRange,
  nearestTimelineEvent,
} from '../../frontend/src/lib/timeline-projection';
const record = (position: number): Event =>
  ({ ref: `M/${position}`, position }) as Event;
it('fills a short sequence with equal intervals instead of isolated fixed-size dots', () => {
  expect(timelineRange(record(0), 4, false)).toEqual([0, 0.25]);
  expect(timelineRange(record(3), 4, false)).toEqual([0.75, 1]);
  expect(timelineRange(record(0), 1, false)).toEqual([0, 1]);
});
it('keeps aggregation, row filtering and interval selection aligned', () => {
  expect(
    timelineRange({ ...record(600), end_position: 609 }, 800, false),
  ).toEqual([0.75, 0.7625]);
});
it('preserves recorded durations and locates the nearest event in whitespace', () => {
  const a = { ...record(0), timeline_start: 0.1, timeline_end: 0.2 },
    b = { ...record(1), timeline_start: 0.6, timeline_end: 0.8 };
  expect(timelineRange(a, 2, true)).toEqual([0.1, 0.2]);
  expect(nearestTimelineEvent([a, b], 0.55, 2, true)).toBe(b);
  expect(nearestTimelineEvent([], 0, 0, false)).toBeUndefined();
});
