import { useState } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import type { AccountUsages } from '../hooks/use-account-usages';
import { currency } from '../lib/account-usage';
import type { BrowserAccount } from '../lib/environment-settings';
import {
  Button,
  BusyState,
  IconButton,
  Notice,
  Select,
  StatusBadge,
} from './ui';
import { UsageAuthorization } from './usage-authorization';
import { AccountUsageWindows } from './account-usage-windows';

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
  const [authorizationOpen, setAuthorizationOpen] = useState(false);
  const refresh = (organization?: string) =>
    usage.refresh(account.id, organization);
  const cached = !!data?.updated_at && (data.status !== 'ready' || data.stale);
  const wait = data
    ? Math.max(0, Math.ceil((data.next_refresh_at * 1000 - now) / 60_000))
    : 0;
  const extra = data?.extra_usage;
  const authorizationLabel =
    data?.authorization && data.authorization.state !== 'none'
      ? '重新授权'
      : '授权后台查询';
  return (
    <section className="account-usage" aria-label="账号用量">
      <div className="account-usage-toolbar">
        <AccountUsageWindows data={data} now={now} />
        <div className="ui-actions">
          {cached && <StatusBadge tone="warning">上次结果</StatusBadge>}
          {data?.windows.length ? (
            <IconButton
              label={authorizationLabel}
              icon={<KeyRound size={15} />}
              disabled={busy || !account.profile_id}
              onClick={() => setAuthorizationOpen(true)}
            />
          ) : (
            <Button
              variant="text"
              size="small"
              disabled={busy || !account.profile_id}
              onClick={() => setAuthorizationOpen(true)}
            >
              <KeyRound size={15} />
              {authorizationLabel}
            </Button>
          )}
          <IconButton
            label="刷新用量"
            title={
              data?.refreshing
                ? '正在查询用量'
                : wait
                  ? `${wait} 分钟后可刷新`
                  : '刷新用量'
            }
            icon={
              <RefreshCw
                size={15}
                className={data?.refreshing ? 'ui-spin' : ''}
              />
            }
            disabled={busy || !data?.can_refresh || data.refreshing}
            onClick={() => void refresh()}
          />
        </div>
      </div>
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
          <span title={data.organization_name}>{data.source_label}</span>
          <time dateTime={new Date(data.updated_at * 1000).toISOString()}>
            更新于 {new Date(data.updated_at * 1000).toLocaleString('zh-CN')}
          </time>
        </div>
      )}
      {authorizationOpen && (
        <UsageAuthorization
          account={account}
          onClose={() => setAuthorizationOpen(false)}
          onVerified={() => void refresh()}
        />
      )}
    </section>
  );
}
