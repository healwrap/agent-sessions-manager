export interface UsageWindow {
  id: string;
  label: string;
  used_percent: number;
  resets_at: string | null;
}

export interface AccountUsage {
  account_id: string;
  status: string;
  refreshing: boolean;
  can_refresh: boolean;
  stale: boolean;
  updated_at: number | null;
  next_refresh_at: number;
  error: string;
  source_label: string;
  organization_id: string;
  organization_name: string;
  organizations: { id: string; name: string }[];
  windows: UsageWindow[];
  extra_usage: {
    used: number;
    limit: number | null;
    used_percent: number | null;
    currency: string;
    resets_at: string | null;
  } | null;
}

export function resetLabel(value: string | null, now: number) {
  if (!value) return '未提供重置时间';
  const remaining = Date.parse(value) - now;
  if (!Number.isFinite(remaining)) return '未提供重置时间';
  if (remaining <= 0) return '重置时间已到，等待刷新';
  const minutes = Math.ceil(remaining / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return days
    ? `${days} 天 ${hours} 小时后重置`
    : hours
      ? `${hours} 小时 ${minutes % 60} 分钟后重置`
      : `${minutes} 分钟后重置`;
}

export function currency(value: number, code: string) {
  try {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: code,
    }).format(value);
  } catch {
    return `${code} ${value.toFixed(2)}`;
  }
}
