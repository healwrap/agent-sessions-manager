import { useState } from 'react';
import type { Event } from '../../lib/types';
import { formatRecordedDuration } from '../../lib/recorded-time';
function formatTimestamp(value: string | null | undefined) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '未记录';
  const pad = (number: number, width = 2) =>
    String(number).padStart(width, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}
export function RecordTiming({
  event,
  request = false,
}: {
  event: Event;
  request?: boolean;
}) {
  const [showUnix, setShowUnix] = useState(false);
  const started = event.timestamp ? Date.parse(event.timestamp) : NaN;
  const delta = (end?: string | null, start?: string | null) =>
    end && start ? Date.parse(end) - Date.parse(start) : null;
  const generation = delta(event.completed_at, event.first_token_at);
  const output = event.usage?.outputTokens;
  const throughput =
    generation != null && generation > 0 && output != null
      ? request
        ? ((output / generation) * 1000).toFixed(1) + ' tok/s'
        : ((output / generation) * 1000).toFixed(2) + ' token / 秒'
      : '未记录';
  const entries = [
    ['开始时间', formatTimestamp(event.timestamp)],
    [
      request ? '总时长' : '时长',
      formatRecordedDuration(event.duration_ms, !request),
    ],
    ...(event.kind === 'assistant'
      ? [
          [
            '首 token 延迟',
            formatRecordedDuration(
              delta(event.first_token_at, event.timestamp),
              !request,
            ),
          ],
          ['生成', formatRecordedDuration(generation, !request)],
          ['吞吐量', throughput],
        ]
      : []),
  ];
  return (
    <dl className="overview">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd title={value}>
            {key === '开始时间' && Number.isFinite(started) ? (
              <button
                type="button"
                className="timestamp-toggle"
                title={showUnix ? '显示本地时间' : '显示 Unix 时间戳'}
                onClick={(event) => {
                  const selection = window.getSelection();
                  if (
                    selection &&
                    !selection.isCollapsed &&
                    selection.rangeCount &&
                    selection.getRangeAt(0).intersectsNode(event.currentTarget)
                  )
                    return;
                  setShowUnix(!showUnix);
                }}
              >
                {showUnix ? (started / 1000).toFixed(3) : value}
              </button>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
