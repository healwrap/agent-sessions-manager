import { useState } from 'react';
import { Monitor, PanelsTopLeft, Pencil, Trash2 } from 'lucide-react';
import type {
  BrowserAccount,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { accountClients, type AccountActions } from '../lib/account-view';
import { AgentIcon } from './agent-icon';
import { Button, ChoiceGroup, IconButton } from './ui';
import { AccountClientPanel } from './account-client-panel';
import { Disclosure } from './disclosure';

export function AccountDetails({
  account,
  data,
  busy,
  ...actions
}: AccountActions & {
  account: BrowserAccount;
  data: EnvironmentSettings;
  busy: boolean;
}) {
  const clients = accountClients(account, data);
  const [target, setTarget] = useState(
    () =>
      clients.find((client) => client.run?.alive)?.target ||
      clients.find((client) => client.profile)?.target ||
      'browser',
  );
  const client = clients.find((item) => item.target === target) || clients[0];
  const live = clients.some(
    (item) => item.run?.alive || item.run?.status === 'checking',
  );
  const [deleting, setDeleting] = useState(false);
  return (
    <section className="account-detail" aria-label={`${account.name} 账号详情`}>
      <header className="account-detail-header">
        <div className="account-detail-identity">
          <span className="account-avatar">
            <AgentIcon source={account.provider} />
          </span>
          <div>
            <span className="account-detail-provider">
              {account.provider === 'claude' ? 'Claude' : 'Codex'}
            </span>
            <h2>{account.name}</h2>
          </div>
        </div>
        <IconButton
          label="编辑账号"
          icon={<Pencil size={17} />}
          disabled={busy || live}
          title={live ? '先停止环境，再编辑账号' : '编辑账号'}
          onClick={() => actions.onEditAccount(account)}
        />
      </header>
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
        {...actions}
      />
      <Disclosure className="account-management" title="账号管理">
        <div className="account-management-actions">
          <Button
            disabled={busy || live}
            title={live ? '先停止环境，再编辑账号' : undefined}
            onClick={() => actions.onEditAccount(account)}
          >
            <Pencil size={16} />
            编辑账号与绑定
          </Button>
          <Button
            disabled={busy || live}
            className="account-delete"
            title={live ? '先停止环境，再移除账号' : undefined}
            onClick={() => setDeleting(true)}
          >
            <Trash2 size={16} />
            移除账号
          </Button>
        </div>
        {deleting && (
          <div className="account-delete-confirm" role="alert">
            <span>移除“{account.name}”的账号入口？环境与登录数据会保留。</span>
            <div>
              <Button disabled={busy} onClick={() => setDeleting(false)}>
                取消
              </Button>
              <Button
                disabled={busy}
                className="account-delete"
                onClick={() => {
                  actions.onDelete(account.id);
                  setDeleting(false);
                }}
              >
                确认移除
              </Button>
            </div>
          </div>
        )}
      </Disclosure>
    </section>
  );
}
