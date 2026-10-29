import { ChartNoAxesCombined, RefreshCw } from 'lucide-react';
import type { AccountUsages } from '../hooks/use-account-usages';
import { currency, resetLabel } from '../lib/account-usage';
import type { BrowserAccount } from '../lib/environment-settings';
import {
  Button,
  BusyState,
  Notice,
  ProgressMeter,
  SectionHeading,
  Select,
  StatusBadge,
} from './ui';

export function AccountUsagePanel({
  account,
  usage,
  busy,
}: {
  account: BrowserAccount;
  usage: AccountUsages;
  busy: boolean;
}) {
  const { error, now } = usage;
  const data = usage.items[account.id];
  const refresh = (organization?: string) =>
    usage.refresh(account.id, organization);
  const cached = !!data?.updated_at && (data.status !== 'ready' || data.stale);
  const wait = data
    ? Math.max(0, Math.ceil((data.next_refresh_at * 1000 - now) / 60_000))
    : 0;
  const extra = data?.extra_usage;
  return (
    <section className="account-usage" aria-label="账号用量">
      <SectionHeading
        level={3}
        title="账号用量"
        icon={<ChartNoAxesCombined size={17} />}
        actions={
          <>
            {cached && <StatusBadge tone="warning">上次结果</StatusBadge>}
            <Button
              variant="text"
              disabled={busy || !data?.can_refresh || data.refreshing}
              onClick={() => void refresh()}
            >
              <RefreshCw
                size={15}
                className={data?.refreshing ? 'ui-spin' : ''}
              />
              {data?.refreshing
                ? '查询中'
                : wait
                  ? `${wait} 分钟后可刷新`
                  : '刷新用量'}
            </Button>
          </>
        }
      />
      {!data && !error && <BusyState label="正在读取账号用量" />}
      {data &&
        !data.windows.length &&
        !extra &&
        !data.error &&
        (data.refreshing ? (
          <BusyState label="正在查询 Claude 用量" />
        ) : (
          <p className="account-usage-empty">尚未取得用量数据</p>
        ))}
      {(error || data?.error) && (
        <Notice tone={data?.status === 'rate_limited' ? 'warning' : 'info'}>
          {error || data?.error}
        </Notice>
      )}
      {data && data.organizations.length > 1 && (
        <Select
          label="用量所属组织"
          value={data.organization_id}
          disabled={data.refreshing || !data.can_refresh}
          onChange={(value) => void refresh(value)}
          options={[
            { value: '', label: '选择组织' },
            ...data.organizations.map((row) => ({
              value: row.id,
              label: row.name,
            })),
          ]}
        />
      )}
      {!!data?.windows.length && (
        <div className="account-usage-windows">
          {data.windows.map((window) => (
            <div className="account-usage-window" key={window.id}>
              <div className="account-usage-value">
                <span>{window.label}</span>
                <strong>
                  {new Intl.NumberFormat('zh-CN', {
                    maximumFractionDigits: 1,
                  }).format(window.used_percent)}
                  <span>% 已用</span>
                </strong>
              </div>
              <ProgressMeter label={window.label} value={window.used_percent} />
              <time
                dateTime={window.resets_at || undefined}
                title={
                  window.resets_at
                    ? new Date(window.resets_at).toLocaleString('zh-CN')
                    : undefined
                }
              >
                {resetLabel(window.resets_at, now)}
              </time>
            </div>
          ))}
        </div>
      )}
      {extra && (
        <div className="account-usage-spending">
          <span>额外用量</span>
          <strong>
            {currency(extra.used, extra.currency)} /{' '}
            {extra.limit === null
              ? '无月度上限'
              : currency(extra.limit, extra.currency)}
          </strong>
        </div>
      )}
      {data?.updated_at && (
        <div className="account-usage-updated">
          <span>{data.organization_name}</span>
          <time dateTime={new Date(data.updated_at * 1000).toISOString()}>
            更新于 {new Date(data.updated_at * 1000).toLocaleString('zh-CN')}
          </time>
        </div>
      )}
    </section>
  );
}
