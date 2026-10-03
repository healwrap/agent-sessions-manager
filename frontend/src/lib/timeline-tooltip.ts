import type { Event } from './types';
import { eventLabel } from './event-presentation';
import { formatRecordedDuration } from './recorded-time';

const time = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
export function timelineTooltip(event: Event) {
  const started = Date.parse(event.timestamp);
  const duration = event.duration_ms;
  const timed =
    typeof duration === 'number' && Number.isFinite(duration) && duration >= 0;
  const first = event.first_token_at ? Date.parse(event.first_token_at) : NaN;
  const completed = event.completed_at ? Date.parse(event.completed_at) : NaN;
  const segments =
    Number.isFinite(first) &&
    Number.isFinite(completed) &&
    Number.isFinite(started) &&
    first >= started &&
    completed >= first
      ? `首 token ${formatRecordedDuration(first - started, true)} · 解码 ${formatRecordedDuration(completed - first, true)}`
      : '';
  return [
    eventLabel(event)[0],
    Number.isFinite(started)
      ? timed
        ? `${time(started)} → ${time(started + duration)}`
        : `开始于 ${time(started)}`
      : '',
    [timed ? `总计 ${formatRecordedDuration(duration, true)}` : '', segments]
      .filter(Boolean)
      .join(' · '),
  ]
    .filter(Boolean)
    .join('\n');
}
