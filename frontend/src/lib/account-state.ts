import type { AccountUsage } from './account-usage';
import { resetLabel } from './account-usage';
import {
  accountHealth,
  currentWindow,
  usageFresh,
  type Plan,
} from './account-overview';
import { accountClients, type AccountClient } from './account-view';
import type {
  BrowserAccount,
  EnvironmentSettings,
} from './environment-settings';

export const accountStates = {
  available: { label: '可用', tone: 'success' },
  exhausted: { label: '额度用尽', tone: 'warning' },
  action: { label: '需处理', tone: 'warning' },
  disabled: { label: '已停用', tone: 'error' },
  unknown: { label: '待确认', tone: 'neutral' },
} as const;
export type AccountStateKind = keyof typeof accountStates;
export type AccountState = ReturnType<typeof accountState>;
export interface AccountFilterValue {
  state: 'all' | AccountStateKind;
  provider: 'all' | BrowserAccount['provider'];
  plan: 'all' | Plan | 'unknown';
  runtime: 'all' | 'running' | 'stopped' | 'checking' | 'issues';
  query: string;
}
export const defaultAccountFilters: AccountFilterValue = {
  state: 'all',
  provider: 'all',
  plan: 'all',
  runtime: 'all',
  query: '',
};

function result(kind: AccountStateKind, reason: string, detail: string) {
  return { kind, ...accountStates[kind], reason, detail };
}

// Account availability comes from the service and shared quota windows.
// A stopped client, a client launch failure, or a token-estimation model is not an account state.
export function accountState(
  account: BrowserAccount,
  data: EnvironmentSettings,
  usage: AccountUsage | undefined,
  now: number,
) {
  const health = accountHealth(usage, now);
  if (health.state === 'disabled')
    return result(
      'disabled',
      '账号已封禁／停用',
      'Claude 明确返回账号已封禁或停用。',
    );
  if (health.state === 'organization_disabled')
    return result('disabled', '组织已停用', 'Claude 明确返回当前组织已停用。');
  const clients = accountClients(account, data);
  if (!clients.some((client) => client.profile))
    return result(
      'action',
      '待绑定环境',
      '为账号绑定独立浏览器或 App 环境后继续。',
    );
  if (
    !clients.some((client) =>
      data.proxies.some((proxy) => proxy.id === client.profile?.proxy_id),
    )
  )
    return result('action', '待配置代理', '为账号的访问环境配置专用代理。');
  if (account.provider !== 'claude')
    return result('unknown', '尚未检测', '尚未取得此账号的访问状态与额度。');
  if (usage?.status === 'authorization_required')
    return result(
      'action',
      '待授权',
      '授权后台查询后，可确认账号状态与剩余额度。',
    );
  if (
    usage?.status === 'login_required' ||
    usage?.authorization?.state === 'login_required'
  )
    return result(
      'action',
      '登录授权已失效',
      '重新授权后台查询，或在账号环境中确认登录。',
    );
  if (usage?.status === 'organization_required')
    return result('action', '待选择组织', '在账号用量中选择要查询的组织。');
  if (usage?.status === 'requires_browser')
    return result(
      'action',
      '待完成页面验证',
      usage.error || '在账号浏览器中完成验证后刷新。',
    );
  if (
    ['blocked', 'error', 'unavailable', 'rate_limited'].includes(
      usage?.status || '',
    )
  ) {
    const reason =
      usage?.status === 'blocked'
        ? '访问受阻'
        : usage?.status === 'rate_limited'
          ? '查询暂时限流'
          : '查询未完成';
    return result(
      'action',
      reason,
      usage?.error || '检查账号代理和登录授权后刷新。',
    );
  }
  if (!usageFresh(usage, now) || health.state !== 'accessible')
    return result(
      'unknown',
      usage?.refreshing
        ? '正在检测'
        : usage?.updated_at
          ? '检测结果已过期'
          : '尚未检测',
      usage?.refreshing
        ? '正在查询当前访问状态与用量。'
        : '刷新用量以确认当前访问状态与额度。',
    );
  const five = currentWindow(usage, 'five_hour', now);
  const week = currentWindow(usage, 'seven_day', now);
  const exhausted =
    five && five.used_percent >= 100
      ? five
      : week && week.used_percent >= 100
        ? week
        : undefined;
  if (exhausted)
    return result(
      'exhausted',
      exhausted.id === 'five_hour' ? '5 小时额度已用尽' : '周额度已用尽',
      exhausted.resets_at
        ? resetLabel(exhausted.resets_at, now)
        : '服务未提供重置时间。',
    );
  if (!five || !week)
    return result(
      'unknown',
      '额度信息不完整',
      '尚未取得完整的 5 小时与周额度。',
    );
  return result('available', '账号可访问', '5 小时与周额度均有余额。');
}

export function matchesRuntime(
  clients: AccountClient[],
  value: AccountFilterValue['runtime'],
) {
  const running = clients.some((client) => client.run?.alive);
  const checking = clients.some((client) => client.run?.status === 'checking');
  if (value === 'running') return running;
  if (value === 'checking') return checking;
  if (value === 'stopped') return !running && !checking;
  if (value === 'issues')
    return clients.some(
      (client) =>
        client.profile &&
        (!client.available ||
          ['blocked', 'failed', 'interrupted'].includes(
            client.run?.status || '',
          )),
    );
  return true;
}
