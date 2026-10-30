import { ShieldCheck } from 'lucide-react';
import type { AccountUsages } from '../hooks/use-account-usages';
import type { AccountState } from '../lib/account-state';
import { StatusBadge } from './ui';

export function AccountStatusPanel({
  accountId,
  usage,
  status,
}: {
  accountId: string;
  usage: AccountUsages;
  status: AccountState;
}) {
  const data = usage.items[accountId];
  const description = status.detail === data?.error ? '' : status.detail;
  return (
    <section className="account-status-panel" aria-label="账号状态">
      <div className="account-status-heading">
        <ShieldCheck size={15} />
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <span>{status.reason}</span>
        {data?.health?.checked_at && (
          <time
            dateTime={new Date(data.health.checked_at * 1000).toISOString()}
          >
            上次检测{' '}
            {new Date(data.health.checked_at * 1000).toLocaleString('zh-CN')}
          </time>
        )}
      </div>
      {description && <p>{description}</p>}
    </section>
  );
}
