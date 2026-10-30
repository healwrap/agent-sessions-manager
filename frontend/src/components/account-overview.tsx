import { useState } from 'react';
import {
  ChartNoAxesCombined,
  CircleHelp,
  RefreshCw,
  Users,
} from 'lucide-react';
import type { AccountUsages } from '../hooks/use-account-usages';
import type { EnvironmentSettings } from '../lib/environment-settings';
import { aggregateQuota, tokens } from '../lib/account-overview';
import { Button, Notice, Panel, SectionHeading, Select } from './ui';
import { accountState } from '../lib/account-state';
import { QuotaSourceDialog } from './quota-source-dialog';

export function AccountOverview({
  data,
  usage,
  busy,
  modelId,
  onModel,
}: {
  data: EnvironmentSettings;
  usage: AccountUsages;
  busy: boolean;
  modelId: string;
  onModel: (id: string) => void;
}) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const { benchmarks, items, now } = usage;
  const models = benchmarks?.models || [];
  const model = models.find((row) => row.id === modelId) || models[0];
  const claude = data.accounts.filter((row) => row.provider === 'claude');
  const available = data.accounts.filter(
    (account) =>
      accountState(account, data, items[account.id], now).kind === 'available',
  ).length;
  const refreshing = Object.values(items).some((row) => row.refreshing);
  const canRefresh = Object.values(items).some((row) => row.can_refresh);
  const quota = [false, true].map((weekly) =>
    aggregateQuota(data.accounts, items, benchmarks, model, now, weekly),
  );
  return (
    <Panel className="account-overview" aria-label="账号总览">
      <SectionHeading
        title="账号总览"
        icon={<ChartNoAxesCombined size={17} />}
        actions={
          <Button
            variant="text"
            size="small"
            disabled={busy || !canRefresh || refreshing}
            onClick={() => void usage.refreshAll()}
          >
            <RefreshCw size={14} className={refreshing ? 'ui-spin' : ''} />
            {refreshing ? '正在更新' : '刷新全部'}
          </Button>
        }
      />
      <div className="account-overview-metrics">
        <div className="account-overview-metric">
          <span>
            <Users size={15} />
            账号总数
          </span>
          <strong>
            {data.accounts.length}
            <small>个</small>
          </strong>
          <p>
            Claude {claude.length}
            {data.accounts.length > claude.length
              ? ` · Codex ${data.accounts.length - claude.length}`
              : ''}
          </p>
        </div>
        <div className="account-overview-metric" data-tone="available">
          <span>可用账号</span>
          <strong>
            {usage.loading ? '—' : available}
            <small>个</small>
          </strong>
          <p>账号可访问，5 小时与周额度均有余额</p>
        </div>
        {quota.map((row, index) => (
          <div className="account-overview-metric" key={index}>
            <span>{index ? '本周' : '5 小时'}剩余额度</span>
            <strong>
              {row.count ? `≈ ${tokens(row.remaining)}` : '—'}
              {row.count > 0 && <small>Token</small>}
            </strong>
            <p>
              {row.count
                ? `满额估算 ≈ ${tokens(row.total)} · 已计入 ${row.count}/${claude.length} 个账号`
                : row.known
                  ? row.unknownPlans
                    ? `${row.unknownPlans} 个账号套餐待确认`
                    : '当前模型缺少可用估算数据'
                  : '等待账号用量数据'}
            </p>
          </div>
        ))}
      </div>
      <div className="account-overview-footer">
        <div className="account-overview-options">
          {!!models.length && (
            <Select
              label="估算模型"
              value={model?.id || ''}
              onChange={onModel}
              options={models.map((row) => ({
                value: row.id,
                label: row.conversion ? `${row.label} · 比例估算` : row.label,
              }))}
            />
          )}
          <span className="account-overview-basis">
            混合 Token（含缓存）· 社区估算
          </span>
          <Button
            variant="text"
            size="small"
            onClick={() => setSourceOpen(true)}
          >
            <CircleHelp size={14} />
            估算依据
          </Button>
        </div>
      </div>
      {usage.error && <Notice tone="error">{usage.error}</Notice>}
      {sourceOpen && (
        <QuotaSourceDialog
          usage={usage}
          model={model}
          onClose={() => setSourceOpen(false)}
        />
      )}
    </Panel>
  );
}
