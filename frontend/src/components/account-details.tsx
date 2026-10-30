import { useEffect, useState } from 'react';
import { Monitor, PanelsTopLeft, Pencil } from 'lucide-react';
import type {
  BrowserAccount,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { accountClients, type AccountActions } from '../lib/account-view';
import {
  ChoiceGroup,
  IconButton,
  RemoveButton,
  SectionHeading,
  StatusBadge,
} from './ui';
import { planLabels } from '../lib/account-overview';
import { AccountClientPanel } from './account-client-panel';
import type { AccountUsages } from '../hooks/use-account-usages';
import { AccountStatusPanel } from './account-status-panel';
import { AccountUsagePanel } from './account-usage-panel';
import type { AccountState } from '../lib/account-state';

export function AccountDetails({
  account,
  data,
  busy,
  guidedTarget,
  usage,
  status,
  ...actions
}: AccountActions & {
  account: BrowserAccount;
  data: EnvironmentSettings;
  busy: boolean;
  guidedTarget?: 'browser' | 'app';
  usage: AccountUsages;
  status: AccountState;
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
        <div className="account-detail-title">
          <div className="account-detail-identity">
            <h2 title={account.name}>{account.name}</h2>
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
        </div>
        <AccountStatusPanel
          accountId={account.id}
          usage={usage}
          status={status}
        />
        {account.provider === 'claude' && (
          <AccountUsagePanel account={account} usage={usage} busy={busy} />
        )}
      </header>
      <div className="account-client-switch">
        <SectionHeading level={3} title="访问环境" />
        <ChoiceGroup
          label="选择访问环境"
          variant="tabs"
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
      {clients.map((item) => (
        <AccountClientPanel
          key={item.target}
          hidden={item.target !== client.target}
          account={account}
          client={item}
          data={data}
          busy={busy}
          {...actions}
        />
      ))}
    </section>
  );
}
