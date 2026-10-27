import { useState } from 'react';
import {
  ExternalLink,
  Globe2,
  Languages,
  LoaderCircle,
  LogIn,
  Pencil,
  Plus,
  ScanLine,
  ShieldCheck,
  Square,
} from 'lucide-react';
import type {
  AppProfile,
  BrowserAccount,
  BrowserProfile,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { browserAvailable, runLabels } from '../lib/environment-settings';
import { AgentIcon } from './agent-icon';
import {
  Button,
  BusyState,
  ChoiceGroup,
  CollectionToolbar,
  EmptyState,
  FactsGrid,
  IconButton,
  RemoveButton,
  ResourceCard,
  StatusBadge,
} from './ui';
import { BrowserLaunchReport } from './browser-launch-report';

export function EnvironmentProfileList({
  data,
  target,
  busy,
  loading,
  onEdit,
  onDelete,
  onRuntime,
  onLogin,
  onCreate,
}: {
  data: EnvironmentSettings;
  target: 'browser' | 'app';
  busy: boolean;
  loading: boolean;
  onEdit: (profile: BrowserProfile | AppProfile) => void;
  onCreate?: () => void;
  onDelete: (id: string) => void;
  onRuntime: (action: 'open' | 'stop', body: { profile_id: string }) => void;
  onLogin?: (account: BrowserAccount) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const profiles = target === 'browser' ? data.profiles : data.app_profiles;
  const runtime = target === 'browser' ? data.browser : data.app_runtime;
  const rows = profiles.map((profile) => {
    const run = runtime.runs.find((row) => row.profile_id === profile.id);
    const account = data.accounts.find(
      (row) =>
        (target === 'browser' ? row.profile_id : row.app_profile_id) ===
        profile.id,
    );
    const proxy = data.proxies.find((row) => row.id === profile.proxy_id);
    return {
      profile,
      run,
      account,
      proxy,
      failed:
        !!run && ['failed', 'blocked', 'interrupted'].includes(run.status),
    };
  });
  const visible = rows.filter(
    ({ profile, account, proxy, run, failed }) =>
      (filter === 'all' || (filter === 'running' ? run?.alive : failed)) &&
      `${profile.name} ${account?.name || ''} ${proxy?.name || ''}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const title = target === 'browser' ? '浏览器' : 'App';
  return (
    <section aria-label={`${title}环境列表`}>
      <CollectionToolbar
        query={query}
        onQuery={setQuery}
        searchLabel={`搜索${title}环境`}
        placeholder="搜索环境、账号或代理"
      >
        <ChoiceGroup
          label="筛选环境状态"
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: '全部', count: rows.length },
            {
              value: 'running',
              label: '运行中',
              count: rows.filter((row) => row.run?.alive).length,
            },
            {
              value: 'attention',
              label: '需处理',
              count: rows.filter((row) => row.failed).length,
            },
          ]}
        />
      </CollectionToolbar>
      {loading && !profiles.length ? (
        <BusyState label="正在读取环境" />
      ) : !visible.length ? (
        <EmptyState
          icon={<ScanLine size={27} />}
          title={!profiles.length ? `还没有${title}环境` : '没有符合条件的环境'}
          action={
            profiles.length ? (
              <Button
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                清除筛选
              </Button>
            ) : (
              onCreate && (
                <Button variant="primary" onClick={onCreate}>
                  <Plus size={16} />
                  新建环境
                </Button>
              )
            )
          }
        />
      ) : (
        <div className="ui-stack">
          {visible.map(({ profile, run, account, proxy, failed }) => {
            const checking = run?.status === 'checking';
            const live = !!run?.alive || checking;
            const session = runtime.sessions?.[profile.id];
            const available =
              target === 'browser'
                ? browserAvailable(data, profile as BrowserProfile)
                : data.apps.some((app) => app.id === 'claude');
            const open = () =>
              target === 'app' &&
              account &&
              onLogin &&
              session?.state !== 'saved' &&
              !run?.alive
                ? onLogin(account)
                : onRuntime('open', { profile_id: profile.id });
            return (
              <ResourceCard
                key={profile.id}
                title={profile.name}
                subtitle={account?.name || '未绑定账号'}
                icon={
                  <AgentIcon
                    source={
                      target === 'browser'
                        ? (profile as BrowserProfile).provider
                        : 'claude'
                    }
                  />
                }
                badge={
                  <StatusBadge
                    tone={
                      failed
                        ? 'error'
                        : checking
                          ? 'warning'
                          : run?.alive
                            ? 'success'
                            : 'neutral'
                    }
                  >
                    {run ? runLabels[run.status] : '尚未启动'}
                  </StatusBadge>
                }
                actions={
                  <>
                    {target === 'app' && account && onLogin && (
                      <Button
                        variant="text"
                        disabled={busy || checking}
                        onClick={() => onLogin(account)}
                      >
                        <LogIn size={16} />
                        登录引导
                      </Button>
                    )}
                    {live && (
                      <IconButton
                        label={`停止环境 ${profile.name}`}
                        icon={<Square size={16} />}
                        disabled={busy}
                        onClick={() =>
                          onRuntime('stop', { profile_id: profile.id })
                        }
                      />
                    )}
                    <Button
                      variant="primary"
                      disabled={busy || checking || !available}
                      onClick={open}
                    >
                      {checking ? (
                        <LoaderCircle size={16} className="ui-spin" />
                      ) : (
                        <ExternalLink size={16} />
                      )}
                      {checking
                        ? '正在检查'
                        : run?.alive
                          ? '切回窗口'
                          : '打开环境'}
                    </Button>
                    <IconButton
                      disabled={busy || live}
                      label={`编辑环境 ${profile.name}`}
                      icon={<Pencil size={17} />}
                      onClick={() => onEdit(profile)}
                    />
                    <RemoveButton
                      disabled={busy || live}
                      label={`移除环境配置 ${profile.name}`}
                      message="只移除配置入口，环境中的浏览数据与登录数据会保留。"
                      onRemove={() => onDelete(profile.id)}
                    />
                  </>
                }
                footer={run && <BrowserLaunchReport run={run} />}
              >
                <FactsGrid
                  columns={3}
                  items={[
                    {
                      label: '网络出口',
                      icon: <Globe2 size={16} />,
                      value: (
                        <>
                          {proxy?.name || '系统路由'}
                          {run?.resolved.ip && <code>{run.resolved.ip}</code>}
                        </>
                      ),
                    },
                    {
                      label: '语言与时区',
                      icon: <Languages size={16} />,
                      value: (
                        <>
                          {profile.locale_mode === 'proxy'
                            ? run?.resolved.locale || '语言跟随代理'
                            : profile.locale}
                          <small>
                            {profile.timezone_mode === 'proxy'
                              ? run?.resolved.timezone || '时区跟随代理'
                              : profile.timezone}
                          </small>
                        </>
                      ),
                    },
                    {
                      label: '登录凭据',
                      icon: <ShieldCheck size={16} />,
                      value:
                        session?.state === 'saved'
                          ? '已保存'
                          : session?.state === 'unavailable'
                            ? '暂无法读取'
                            : '尚未保存',
                    },
                  ]}
                />
              </ResourceCard>
            );
          })}
        </div>
      )}
    </section>
  );
}
