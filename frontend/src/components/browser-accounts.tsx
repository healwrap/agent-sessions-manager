import { useMemo, useState } from 'react';
import {
  ChevronRight,
  Monitor,
  PanelsTopLeft,
  Plus,
  SearchX,
  Users,
} from 'lucide-react';
import type { EnvironmentSettings } from '../lib/environment-settings';
import {
  accountClients,
  accountStatus,
  needsAttention,
  type AccountActions,
} from '../lib/account-view';
import { Button } from './primitives';
import { StatusBadge } from './form-controls';
import { AgentIcon } from './agent-icon';
import { KernelControl } from './kernel-control';
import { SearchField } from './search-field';
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
        <div className="environment-error-bar" role="alert" key={message}>
          {message}
        </div>
      ))}
      {!loading && !data.browser.kernel.available && (
        <KernelControl kernel={data.browser.kernel} onInstall={onInstall} />
      )}
      <div className="accounts-toolbar">
        <div
          className="accounts-filters"
          role="group"
          aria-label="筛选账号状态"
        >
          {filters.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </div>
        <SearchField
          value={query}
          onChange={setQuery}
          label="搜索账号"
          placeholder="搜索账号或代理"
        />
      </div>
      {loading && !accounts.length ? (
        <div
          className="accounts-loading"
          role="status"
          aria-label="正在读取账号"
        >
          {[0, 1, 2].map((item) => (
            <div key={item} />
          ))}
        </div>
      ) : !accounts.length ? (
        <section className="accounts-empty">
          <span className="accounts-empty-symbol">
            <Users size={30} strokeWidth={1.5} />
          </span>
          <h2>添加你的第一个账号</h2>
          <Button
            variant="primary"
            onClick={() => actions.onEditAccount()}
            disabled={busy}
          >
            <Plus size={16} />
            添加账号
          </Button>
        </section>
      ) : !visible.length ? (
        <section className="accounts-empty">
          <SearchX size={30} strokeWidth={1.5} />
          <h2>没有符合条件的账号</h2>
          <Button
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
          >
            清除筛选
          </Button>
        </section>
      ) : (
        <div className="accounts-split">
          <div className="accounts-list" role="group" aria-label="账号列表">
            {visible.map(({ account, clients, status, proxies }) => (
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
                  <span>
                    {account.provider === 'claude' ? 'Claude' : 'Codex'}
                  </span>
                </span>
                <ChevronRight className="account-list-arrow" size={16} />
                <span className="account-list-status">
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  <span className="account-list-clients">
                    {clients
                      .filter((client) => client.profile)
                      .map((client) => (
                        <span
                          key={client.target}
                          title={`${client.title}：${client.run?.alive ? '运行中' : '未运行'}`}
                          data-live={!!client.run?.alive}
                        >
                          {client.target === 'browser' ? (
                            <PanelsTopLeft size={14} />
                          ) : (
                            <Monitor size={14} />
                          )}
                        </span>
                      ))}
                  </span>
                </span>
                <span
                  className="account-list-proxy"
                  title={Array.from(new Set(proxies)).join(' / ')}
                >
                  {Array.from(new Set(proxies)).join(' / ')}
                </span>
              </button>
            ))}
          </div>
          <AccountDetails
            key={current.account.id}
            account={current.account}
            data={data}
            busy={busy}
            {...actions}
          />
        </div>
      )}
    </div>
  );
}
