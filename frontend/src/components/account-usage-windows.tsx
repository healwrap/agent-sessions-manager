import type { AccountUsage } from '../lib/account-usage';
import { resetLabel } from '../lib/account-usage';
import { ProgressMeter } from './ui';

export function AccountUsageWindows({
  data,
  now,
  compact = false,
}: {
  data?: AccountUsage;
  now: number;
  compact?: boolean;
}) {
  const windows = compact
    ? data?.windows.filter((row) => ['five_hour', 'seven_day'].includes(row.id))
    : data?.windows;
  if (!windows?.length) return null;
  const cached = !!data && (data.status !== 'ready' || data.stale);
  return (
    <span
      className="account-usage-windows"
      data-compact={compact || undefined}
      aria-label={compact ? '账号用量摘要' : undefined}
      title={cached ? '上次查询结果' : undefined}
    >
      {windows.map((window) => (
        <span className="account-usage-window" key={window.id}>
          <span className="account-usage-value">
            <span>
              {window.id === 'five_hour'
                ? '5 小时'
                : window.id === 'seven_day'
                  ? '周额度'
                  : window.label}
            </span>
            <strong>
              {new Intl.NumberFormat('zh-CN', {
                maximumFractionDigits: 1,
              }).format(window.used_percent)}
              %{!compact && <span> 已用</span>}
            </strong>
          </span>
          <ProgressMeter label={window.label} value={window.used_percent} />
          {!compact && window.resets_at && (
            <time
              dateTime={window.resets_at}
              title={new Date(window.resets_at).toLocaleString('zh-CN')}
            >
              {resetLabel(window.resets_at, now)}
            </time>
          )}
        </span>
      ))}
    </span>
  );
}
