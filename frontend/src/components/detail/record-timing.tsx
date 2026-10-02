import type { Event } from '../../lib/types';
import { formatRecordedDuration } from '../../lib/recorded-time';
export function RecordTiming({ event }: { event: Event }) {
  const delta = (end?: string | null, start?: string | null) =>
    end && start ? Date.parse(end) - Date.parse(start) : null;
  const generation = delta(event.completed_at, event.first_token_at);
  const output = event.usage?.outputTokens;
  const throughput =
    generation != null && generation > 0 && output != null
      ? ((output / generation) * 1000).toFixed(2) + ' token / 秒'
      : '未记录';
  const entries = [
    [
      '开始时间',
      event.timestamp
        ? new Date(event.timestamp).toLocaleString() +
          '.' +
          String(new Date(event.timestamp).getMilliseconds()).padStart(3, '0')
        : '未记录',
    ],
    ['时长', formatRecordedDuration(event.duration_ms, true)],
    ...(event.kind === 'assistant'
      ? [
          [
            '首 token 延迟',
            formatRecordedDuration(
              delta(event.first_token_at, event.timestamp),
              true,
            ),
          ],
          ['生成', formatRecordedDuration(generation, true)],
          ['吞吐量', throughput],
        ]
      : []),
  ];
  return (
    <dl className="overview">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
