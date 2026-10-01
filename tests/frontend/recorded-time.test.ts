import { expect, it } from 'vitest';
import type { Trajectory } from '../../frontend/src/lib/types';
import {
  durationAvailable,
  usesRecordedDuration,
  formatRecordedDuration,
} from '../../frontend/src/lib/recorded-time';
const data = (active_duration_ms: number) =>
  ({ active_duration_ms }) as Trajectory;
it('uses the same sequence fallback for drawing, filtering and navigation when duration is missing', () => {
  expect(durationAvailable(null)).toBe(false);
  expect(usesRecordedDuration(true, data(0))).toBe(false);
  expect(usesRecordedDuration(true, data(NaN))).toBe(false);
  expect(usesRecordedDuration(true, data(1500))).toBe(true);
  expect(usesRecordedDuration(false, data(1500))).toBe(false);
});
it('never displays invalid duration as NaN and preserves a recorded zero', () => {
  for (const value of [undefined, null, NaN, Infinity, -1])
    expect(formatRecordedDuration(value)).toBe('未记录');
  expect(formatRecordedDuration(0)).toBe('0.00 秒');
  expect(formatRecordedDuration(1540)).toBe('1.54 秒');
  expect(formatRecordedDuration(1540, true)).toBe('1540 毫秒');
});
