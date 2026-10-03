import type { Trajectory } from './types';

export function durationAvailable(data: Trajectory | null) {
  return (
    Number.isFinite(data?.active_duration_ms) && data!.active_duration_ms > 0
  );
}
export function usesRecordedDuration(wanted: boolean, data: Trajectory | null) {
  return wanted && durationAvailable(data);
}
export function formatRecordedDuration(
  value: number | null | undefined,
  milliseconds = false,
) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    return '未记录';
  if (milliseconds) return `${Math.round(value).toLocaleString('en-US')} 毫秒`;
  return value < 1000
    ? `${Math.round(value)} 毫秒`
    : `${(value / 1000).toFixed(value < 10000 ? 2 : 1)} 秒`;
}
