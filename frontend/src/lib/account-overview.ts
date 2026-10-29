import type { AccountUsage } from './account-usage';
import type { BrowserAccount } from './environment-settings';

export const planLabels = { pro: 'Pro', max5: 'Max 5×', max20: 'Max 20×' };
export type Plan = keyof typeof planLabels;
export type TokenBasis = 'input' | 'output' | 'mixed';
export const basisLabels = {
  input: '纯输入 Token',
  output: '纯输出 Token',
  mixed: '混合 Token（含缓存）',
};
export interface TokenFigure {
  value: number;
  low: number | null;
  high: number | null;
}
export interface BenchmarkModel {
  id: string;
  label: string;
  family: string;
  as_of: string | null;
  rate_source: string;
  qualification: string;
  input: TokenFigure | null;
  output: TokenFigure | null;
  mixed: TokenFigure | null;
  mixed_as_of: string | null;
  plans: Partial<Record<Plan, { included: boolean; weekly_fraction: number }>>;
}
export interface QuotaBenchmarks {
  source_label: string;
  source_url: string;
  data_url: string;
  generated_at: string;
  observed_at: string | null;
  models: BenchmarkModel[];
  plan_ratios: Record<Plan, number>;
  plan_basis: { as_of?: string; source_url?: string };
  weekly_windows: Record<
    Plan,
    { value: number | null; inferred: boolean; stale: boolean }
  >;
  cache_read_share: number | null;
  sample_count: number | null;
  account_count: number | null;
  proxy_id: string;
  fetched_at: number | null;
  refreshing: boolean;
  error: string;
  stale: boolean;
  next_refresh_at: number;
}
export interface UsageOverview {
  items: AccountUsage[];
  benchmarks: QuotaBenchmarks;
}
export type QuotaState = 'available' | 'exhausted' | 'restricted' | 'unknown';
export function accountHealth(usage: AccountUsage | undefined, now: number) {
  const health = usage?.health;
  if (health?.state === 'disabled' || usage?.status === 'account_disabled')
    return {
      state: 'disabled' as const,
      label: '已封禁／停用',
      tone: 'error' as const,
    };
  if (
    health?.state === 'organization_disabled' ||
    usage?.status === 'organization_disabled'
  )
    return {
      state: 'organization_disabled' as const,
      label: '组织已停用',
      tone: 'error' as const,
    };
  if (health?.state === 'accessible' && now / 1000 - health.checked_at < 300)
    return {
      state: 'accessible' as const,
      label: '可访问',
      tone: 'success' as const,
    };
  return {
    state: 'unknown' as const,
    label: health?.state === 'accessible' ? '上次可访问' : '待确认',
    tone: 'neutral' as const,
  };
}
export function currentWindow(
  usage: AccountUsage | undefined,
  id: string,
  now: number,
) {
  const window = usage?.windows.find((row) => row.id === id);
  if (!window || (window.resets_at && Date.parse(window.resets_at) <= now))
    return undefined;
  return window;
}
export function usageFresh(usage: AccountUsage | undefined, now: number) {
  return (
    !!usage &&
    usage.status === 'ready' &&
    !usage.stale &&
    !!usage.updated_at &&
    now / 1000 - usage.updated_at < 300
  );
}
export function quotaState(
  usage: AccountUsage | undefined,
  now: number,
  model?: BenchmarkModel,
): { state: QuotaState; label: string } {
  if (usage?.status === 'account_disabled')
    return { state: 'restricted', label: '账号已停用' };
  if (usage?.status === 'organization_disabled')
    return { state: 'restricted', label: '组织已停用' };
  if (usage?.plan && model?.plans[usage.plan]?.included === false)
    return { state: 'unknown', label: '套餐未含此模型' };
  if (!usageFresh(usage, now))
    return {
      state: 'unknown',
      label: usage?.refreshing
        ? '查询中'
        : usage?.status === 'login_required'
          ? '需重新登录'
          : '额度待确认',
    };
  const five = currentWindow(usage, 'five_hour', now);
  const week = currentWindow(usage, 'seven_day', now);
  if (five && five.used_percent >= 100)
    return { state: 'exhausted', label: '5 小时已用尽' };
  if (week && week.used_percent >= 100)
    return { state: 'exhausted', label: '周额度已用尽' };
  const scoped = modelWindows(usage!, model).filter(
    (row) => !row.resets_at || Date.parse(row.resets_at) > now,
  );
  if (
    scoped.some(
      (row) =>
        (!row.resets_at || Date.parse(row.resets_at) > now) &&
        row.used_percent >= 100,
    )
  )
    return { state: 'exhausted', label: '模型额度已用尽' };
  if (!five || !week) return { state: 'unknown', label: '额度不完整' };
  if (
    usage?.plan &&
    (model?.plans[usage.plan]?.weekly_fraction ?? 1) < 1 &&
    !scoped.length
  )
    return { state: 'unknown', label: '模型额度待确认' };
  return { state: 'available', label: '额度可用' };
}
function modelWindows(usage: AccountUsage, model?: BenchmarkModel) {
  const family = model?.family.split('-')[0];
  return family
    ? usage.windows.filter(
        (row) =>
          row.id === `seven_day_${family}` ||
          (row.id.startsWith('model:') &&
            row.label.toLowerCase().includes(family)),
      )
    : [];
}
export function tokens(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}
export function tokenCapacity(
  benchmarks: QuotaBenchmarks,
  model: BenchmarkModel,
  plan: Plan,
  basis: TokenBasis,
  weekly = false,
) {
  if (model.plans[plan]?.included === false) return null;
  const window = model[basis];
  const week = benchmarks.weekly_windows[plan];
  if (!window || (weekly && (week.value === null || week.stale))) return null;
  const scale =
    benchmarks.plan_ratios[plan] *
    (weekly ? week.value! * (model.plans[plan]?.weekly_fraction ?? 1) : 1);
  return {
    value: window.value * scale,
    low: window.low === null ? null : window.low * scale,
    high: window.high === null ? null : window.high * scale,
  };
}
export function aggregateQuota(
  accounts: BrowserAccount[],
  items: Record<string, AccountUsage>,
  benchmarks: QuotaBenchmarks | undefined,
  model: BenchmarkModel | undefined,
  basis: TokenBasis,
  now: number,
  weekly: boolean,
) {
  let remaining = 0,
    total = 0,
    count = 0,
    shares = 0,
    known = 0,
    unknownPlans = 0,
    missingEstimate = 0;
  const seen = new Set<string>();
  for (const account of accounts) {
    const usage = items[account.id];
    if (account.provider !== 'claude' || !usageFresh(usage, now)) continue;
    const key = usage.identity
      ? `${usage.identity.toLowerCase()}:${usage.organization_id}`
      : account.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const window = currentWindow(
      usage,
      weekly ? 'seven_day' : 'five_hour',
      now,
    );
    if (!window) continue;
    known++;
    shares += Math.max(0, 1 - window.used_percent / 100);
    const plan = account.usage_plan || usage.plan;
    if (!plan) {
      unknownPlans++;
      continue;
    }
    if (!benchmarks || !model) {
      missingEstimate++;
      continue;
    }
    const capacity = tokenCapacity(benchmarks, model, plan, basis, weekly);
    if (!capacity) {
      missingEstimate++;
      continue;
    }
    let fraction = Math.max(0, 1 - window.used_percent / 100);
    let available = capacity.value * fraction;
    if (weekly) {
      const scoped = modelWindows(usage, model).filter(
        (row) => !row.resets_at || Date.parse(row.resets_at) > now,
      );
      const modelFraction = model.plans[plan]?.weekly_fraction ?? 1;
      if (modelFraction < 1 && !scoped.length) {
        missingEstimate++;
        continue;
      }
      available = Math.min(
        capacity.value,
        (capacity.value / modelFraction) * fraction,
      );
      for (const row of scoped) {
        available = Math.min(
          available,
          capacity.value * Math.max(0, 1 - row.used_percent / 100),
        );
      }
    }
    total += capacity.value;
    remaining += available;
    count++;
  }
  return {
    remaining,
    total,
    count,
    shares,
    known,
    unknownPlans,
    missingEstimate,
  };
}
