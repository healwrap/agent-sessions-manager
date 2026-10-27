import { useMemo, useState } from 'react';
import { ChevronRight, Plus, SearchX, Users } from 'lucide-react';
import type { EnvironmentSettings } from '../lib/environment-settings';
import {
  accountClients,
  accountStatus,
  needsAttention,
  type AccountActions,
} from '../lib/account-view';
import {
  Button,
  BusyState,
  ChoiceGroup,
  CollectionToolbar,
  CollectionPanel,
  MasterDetail,
  EmptyState,
  Notice,
} from './ui';
import { StatusBadge } from './form-controls';
import { AgentIcon } from './agent-icon';
import { KernelControl } from './kernel-control';
import { AccountDetails } from './account-details';

export function BrowserAccounts({
  data,
  busy,
  loading,
  onInstall,
  ...actions
}: AccountActions & {
  data: EnvironmentSettings;
  busy: boolean;
  loading: boolean;
  onInstall: (action: 'check' | 'install') => void;
}) {
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const accounts = useMemo(
    () =>
      data.accounts.map((account) => {
        const clients = accountClients(account, data);
        const proxies = clients
          .filter((client) => client.profile)
          .map(
            (client) =>
              data.proxies.find(
                (proxy) => proxy.id === client.profile?.proxy_id,
              )?.name || '系统路由',
          );
        return {
          account,
          clients,
          proxies,
          status: accountStatus(clients),
          running: clients.some((client) => client.run?.alive),
          attention: clients.some(needsAttention),
        };
      }),
    [data],
  );
  const filters = [
    { id: 'all', label: '全部', count: accounts.length },
    {
      id: 'running',
      label: '运行中',
      count: accounts.filter((item) => item.running).length,
    },
    {
      id: 'attention',
      label: '待处理',
      count: accounts.filter((item) => item.attention).length,
    },
  ];
  const visible = accounts.filter(
    (item) =>
      (filter === 'all' ||
        (filter === 'running' ? item.running : item.attention)) &&
      [
        item.account.name,
        item.account.provider,
        ...item.proxies,
        ...item.clients.map((client) => client.profile?.name || ''),
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const current =
    visible.find((item) => item.account.id === selected) || visible[0];
  return (
    <div className="accounts-manager">
      {data.app_runtime.warnings?.map((message) => (
        <Notice tone="warning" key={message}>
          {message}
        </Notice>
      ))}
      {!loading && !data.browser.kernel.available && (
        <KernelControl kernel={data.browser.kernel} onInstall={onInstall} />
      )}
      <CollectionPanel
        toolbar={
          <CollectionToolbar
            query={query}
            onQuery={setQuery}
            searchLabel="搜索账号"
            placeholder="搜索账号或代理"
          >
            <ChoiceGroup
              label="筛选账号状态"
              value={filter}
              onChange={setFilter}
              items={filters.map((item) => ({
                value: item.id,
                label: item.label,
                count: item.count,
              }))}
            />
          </CollectionToolbar>
        }
      >
        {loading && !accounts.length ? (
          <BusyState label="正在读取账号" />
        ) : !accounts.length ? (
          <EmptyState
            icon={<Users size={28} />}
            title="添加你的第一个账号"
            action={
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => actions.onEditAccount()}
              >
                <Plus size={16} />
                添加账号
              </Button>
            }
          />
        ) : !visible.length ? (
          <EmptyState
            icon={<SearchX size={28} />}
            title="没有符合条件的账号"
            action={
              <Button
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                清除筛选
              </Button>
            }
          />
        ) : (
          <MasterDetail
            navigation={
              <div className="accounts-list" role="group" aria-label="账号列表">
                {visible.map(({ account, status }) => (
                  <button
                    className="account-list-item"
                    type="button"
                    key={account.id}
                    aria-pressed={current.account.id === account.id}
                    aria-label={`查看账号 ${account.name}`}
                    onClick={() => setSelected(account.id)}
                  >
                    <span className="account-avatar">
                      <AgentIcon source={account.provider} />
                    </span>
                    <span className="account-list-identity">
                      <strong>{account.name}</strong>
                      <span className="account-list-caption">
                        {account.provider === 'claude' ? 'Claude' : 'Codex'}
                        {status.label !== '凭据已保存' && (
                          <StatusBadge tone={status.tone}>
                            {status.label}
                          </StatusBadge>
                        )}
                      </span>
                    </span>
                    <ChevronRight className="account-list-arrow" size={16} />
                  </button>
                ))}
              </div>
            }
          >
            <AccountDetails
              key={current.account.id}
              account={current.account}
              data={data}
              busy={busy}
              {...actions}
            />
          </MasterDetail>
        )}
      </CollectionPanel>
    </div>
  );
}
