import { useEffect, useState } from 'react';
import { Monitor, PanelsTopLeft, Pencil } from 'lucide-react';
import type {
  BrowserAccount,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { accountClients, type AccountActions } from '../lib/account-view';
import { ChoiceGroup, IconButton, RemoveButton, StatusBadge } from './ui';
import { planLabels } from '../lib/account-overview';
import { AccountClientPanel } from './account-client-panel';
import type { AccountUsages } from '../hooks/use-account-usages';
import { AccountHealthPanel } from './account-health-panel';

export function AccountDetails({
  account,
  data,
  busy,
  guidedTarget,
  usage,
  ...actions
}: AccountActions & {
  account: BrowserAccount;
  data: EnvironmentSettings;
  busy: boolean;
  guidedTarget?: 'browser' | 'app';
  usage: AccountUsages;
}) {
  const clients = accountClients(account, data);
  const [target, setTarget] = useState(
    () =>
      clients.find((client) => client.run?.alive)?.target ||
      clients.find((client) => client.profile)?.target ||
      'browser',
  );
  const client = clients.find((item) => item.target === target) || clients[0];
  useEffect(() => {
    if (guidedTarget) setTarget(guidedTarget);
  }, [guidedTarget]);
  const live = clients.some(
    (item) => item.run?.alive || item.run?.status === 'checking',
  );
  const plan = account.usage_plan || usage.items[account.id]?.plan;
  return (
    <section
      className="account-detail"
      data-guide-account-id={account.id}
      aria-label={`${account.name} 账号详情`}
    >
      <header className="account-detail-header">
        <div className="account-detail-identity">
          <h2>{account.name}</h2>
          {account.provider === 'claude' && (
            <StatusBadge>
              {plan ? planLabels[plan] : '套餐待确认'}
              {account.usage_plan ? '（手动）' : ''}
            </StatusBadge>
          )}
        </div>
        <div className="ui-actions">
          <IconButton
            label="编辑账号与绑定"
            icon={<Pencil size={17} />}
            disabled={busy || live}
            title={live ? '先停止环境，再编辑账号' : '编辑账号与绑定'}
            onClick={() => actions.onEditAccount(account)}
          />
          <RemoveButton
            label="移除账号"
            message={`移除“${account.name}”的账号入口？环境与登录数据会保留。`}
            disabled={busy || live}
            onRemove={() => actions.onDelete(account.id)}
          />
        </div>
      </header>
      {account.provider === 'claude' && (
        <AccountHealthPanel accountId={account.id} usage={usage} busy={busy} />
      )}
      <div className="account-client-switch">
        <ChoiceGroup
          label="选择使用方式"
          variant="segmented"
          value={client.target}
          onChange={setTarget}
          items={clients.map((item) => ({
            value: item.target,
            icon:
              item.target === 'browser' ? (
                <PanelsTopLeft size={17} />
              ) : (
                <Monitor size={17} />
              ),
            label: (
              <>
                {item.title}
                {item.run?.alive && (
                  <span className="account-live-dot" aria-label="运行中" />
                )}
              </>
            ),
          }))}
        />
      </div>
      <AccountClientPanel
        key={client.target}
        account={account}
        client={client}
        data={data}
        busy={busy}
        usage={usage}
        {...actions}
      />
    </section>
  );
}
