import { ScanLine, ShieldCheck } from 'lucide-react';
import type { AccountUsages } from '../hooks/use-account-usages';
import { accountHealth } from '../lib/account-overview';
import { Button, StatusBadge } from './ui';

export function AccountHealthPanel({
  accountId,
  usage,
  busy,
}: {
  accountId: string;
  usage: AccountUsages;
  busy: boolean;
}) {
  const data = usage.items[accountId];
  const health = accountHealth(data, usage.now);
  return (
    <section className="account-health-panel" aria-label="账号封禁状态">
      <div className="account-health-identity">
        <span>
          <ShieldCheck size={15} />
          账号状态
        </span>
        <StatusBadge tone={health.tone}>{health.label}</StatusBadge>
        {data?.health?.checked_at && (
          <time
            dateTime={new Date(data.health.checked_at * 1000).toISOString()}
          >
            检测于{' '}
            {new Date(data.health.checked_at * 1000).toLocaleString('zh-CN')}
          </time>
        )}
      </div>
      <Button
        variant="text"
        size="small"
        disabled={busy || !data?.can_refresh || data.refreshing}
        onClick={() => void usage.refresh(accountId)}
        title={
          data?.can_refresh
            ? '通过账号受控环境查询 Claude 访问状态与用量'
            : '检测与用量查询共用刷新间隔'
        }
      >
        <ScanLine size={14} />
        {data?.refreshing ? '检测中' : '检测账号'}
      </Button>
    </section>
  );
}
