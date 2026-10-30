import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Plus, SearchX, Users } from 'lucide-react';
import type { EnvironmentSettings } from '../lib/environment-settings';
import { accountClients, type AccountActions } from '../lib/account-view';
import {
  Button,
  BusyState,
  CollectionPanel,
  MasterDetail,
  EmptyState,
  Notice,
} from './ui';
import { StatusBadge } from './form-controls';
import { AgentIcon } from './agent-icon';
import { AccountDetails } from './account-details';
import { useSessionStore } from '../hooks/use-session-store';
import { sessionStore } from '../state/session-store';
import { guideStore } from '../state/guide-store';
import { useAccountUsages } from '../hooks/use-account-usages';
import { AccountOverview } from './account-overview';
import { planLabels } from '../lib/account-overview';
import {
  accountState,
  accountStates,
  defaultAccountFilters,
  matchesRuntime,
  type AccountStateKind,
} from '../lib/account-state';
import { AccountFilters } from './account-filters';
import { AccountUsageWindows } from './account-usage-windows';

export function BrowserAccounts({
  data,
  busy,
  loading,
  guidedAccountId,
  guidedTarget,
  active = true,
  ...actions
}: AccountActions & {
  data: EnvironmentSettings;
  busy: boolean;
  loading: boolean;
  guidedAccountId?: string;
  guidedTarget?: 'browser' | 'app';
  active?: boolean;
}) {
  const usage = useAccountUsages(data, active);
  const [estimateModel, setEstimateModel] = useState('claude-opus-5-5');
  const { preferences } = useSessionStore();
  const [selected, setSelected] = useState('');
  const [filters, setFilters] = useState(defaultAccountFilters);
  useEffect(() => {
    if (guidedAccountId) {
      setSelected(guidedAccountId);
      setFilters(defaultAccountFilters);
    }
  }, [guidedAccountId]);
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
              )?.name || '未绑定代理',
          );
        return {
          account,
          clients,
          proxies,
          status: accountState(
            account,
            data,
            usage.items[account.id],
            usage.now,
          ),
          plan: account.usage_plan || usage.items[account.id]?.plan,
        };
      }),
    [data, usage.items, usage.now],
  );
  const matching = accounts.filter(
    (item) =>
      (filters.provider === 'all' ||
        item.account.provider === filters.provider) &&
      (filters.plan === 'all' ||
        (filters.plan === 'unknown'
          ? !item.plan
          : item.plan === filters.plan)) &&
      matchesRuntime(item.clients, filters.runtime) &&
      [
        item.account.name,
        item.account.provider,
        ...item.proxies,
        ...item.clients.map((client) => client.profile?.name || ''),
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(filters.query.trim().toLocaleLowerCase()),
  );
  const counts = Object.fromEntries([
    ['all', matching.length],
    ...Object.keys(accountStates).map((kind) => [
      kind,
      matching.filter((item) => item.status.kind === kind).length,
    ]),
  ]) as Record<'all' | AccountStateKind, number>;
  const visible = matching.filter(
    (item) => filters.state === 'all' || item.status.kind === filters.state,
  );
  const current =
    visible.find((item) => item.account.id === selected) || visible[0];
  return (
    <div className="accounts-manager">
      <AccountOverview
        data={data}
        usage={usage}
        busy={busy}
        modelId={estimateModel}
        onModel={setEstimateModel}
      />
      {data.app_runtime.warnings?.map((message) => (
        <Notice tone="warning" key={message}>
          {message}
        </Notice>
      ))}
      <CollectionPanel
        toolbar={
          <AccountFilters
            value={filters}
            counts={counts}
            onChange={setFilters}
          />
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
                  setFilters(defaultAccountFilters);
                }}
              >
                清除筛选
              </Button>
            }
          />
        ) : (
          <MasterDetail
            navigationWidth={preferences.accountListWidth}
            onNavigationResize={(width) => {
              const { accountListWidth: _, ...preferences } =
                sessionStore.state.preferences;
              void sessionStore.savePreferences(
                width === undefined
                  ? preferences
                  : { ...preferences, accountListWidth: width },
              );
            }}
            navigation={
              <div
                className="accounts-list"
                role="group"
                aria-label="账号列表"
                data-guide="account-list"
              >
                {visible.map(({ account, status, plan }) => {
                  return (
                    <button
                      className="account-list-item"
                      type="button"
                      key={account.id}
                      aria-pressed={current.account.id === account.id}
                      aria-label={`查看账号 ${account.name}`}
                      onClick={() => {
                        setSelected(account.id);
                        guideStore.selectedAccount(account.id);
                      }}
                    >
                      <span className="account-avatar">
                        <AgentIcon source={account.provider} />
                      </span>
                      <span className="account-list-identity">
                        <strong data-tooltip={account.name}>
                          {account.name}
                        </strong>
                        <span className="account-list-caption">
                          {account.provider === 'claude' ? 'Claude' : 'Codex'}
                          {account.provider === 'claude' && plan && (
                            <span>{planLabels[plan]}</span>
                          )}
                          <StatusBadge tone={status.tone}>
                            {status.label}
                          </StatusBadge>
                        </span>
                      </span>
                      <ChevronRight className="account-list-arrow" size={16} />
                      {account.provider === 'claude' && (
                        <AccountUsageWindows
                          data={usage.items[account.id]}
                          now={usage.now}
                          compact
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            }
          >
            <AccountDetails
              key={current.account.id}
              account={current.account}
              data={data}
              busy={busy}
              usage={usage}
              status={current.status}
              guidedTarget={guidedTarget}
              {...actions}
            />
          </MasterDetail>
        )}
      </CollectionPanel>
    </div>
  );
}
