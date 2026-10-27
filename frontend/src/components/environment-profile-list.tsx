import { ExternalLink, Pencil, Square, Trash2 } from 'lucide-react';
import type {
  AppProfile,
  BrowserAccount,
  BrowserProfile,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { browserAvailable, runLabels } from '../lib/environment-settings';
import { AgentIcon } from './agent-icon';
import { Button, IconButton } from './primitives';
import { StatusBadge } from './form-controls';
import { BrowserLaunchReport } from './browser-launch-report';

export function EnvironmentProfileList({
  data,
  target,
  busy,
  onEdit,
  onDelete,
  onRuntime,
  onLogin,
}: {
  data: EnvironmentSettings;
  target: 'browser' | 'app';
  busy: boolean;
  onEdit: (profile: BrowserProfile | AppProfile) => void;
  onDelete: (id: string) => void;
  onRuntime: (action: 'open' | 'stop', body: { profile_id: string }) => void;
  onLogin?: (account: BrowserAccount) => void;
}) {
  const profiles = target === 'browser' ? data.profiles : data.app_profiles;
  const runtime = target === 'browser' ? data.browser : data.app_runtime;
  return (
    <section
      className="environment-profile-list"
      aria-label={target === 'browser' ? '浏览器环境列表' : 'App 环境列表'}
    >
      {!profiles.length && (
        <div className="environment-panel environment-empty">
          <h3>还没有{target === 'browser' ? '浏览器' : 'App'}环境</h3>
        </div>
      )}
      {profiles.map((profile) => {
        const run = runtime.runs.find((row) => row.profile_id === profile.id);
        const live = run?.alive || run?.status === 'checking';
        const account = data.accounts.find(
          (row) =>
            (target === 'browser' ? row.profile_id : row.app_profile_id) ===
            profile.id,
        );
        const session = runtime.sessions?.[profile.id];
        const failed =
          !!run && ['failed', 'blocked', 'interrupted'].includes(run.status);
        return (
          <article
            className="environment-panel environment-profile"
            key={profile.id}
          >
            <header className="environment-profile-heading">
              <AgentIcon
                source={
                  target === 'browser'
                    ? (profile as BrowserProfile).provider
                    : 'claude'
                }
              />
              <div className="environment-profile-name">
                <h2>{profile.name}</h2>
                <span>{account?.name || '未绑定账号'}</span>
              </div>
              <StatusBadge
                tone={failed ? 'error' : run?.alive ? 'success' : 'neutral'}
              >
                {run ? runLabels[run.status] : '尚未启动'}
              </StatusBadge>
              <div className="environment-row-actions">
                {target === 'app' && account && onLogin && (
                  <Button
                    disabled={busy || run?.status === 'checking'}
                    onClick={() => onLogin(account)}
                  >
                    登录引导
                  </Button>
                )}
                <Button
                  disabled={
                    busy ||
                    run?.status === 'checking' ||
                    (target === 'browser' &&
                      !browserAvailable(data, profile as BrowserProfile))
                  }
                  onClick={() => {
                    if (
                      target === 'app' &&
                      account &&
                      onLogin &&
                      session?.state !== 'saved'
                    )
                      onLogin(account);
                    else onRuntime('open', { profile_id: profile.id });
                  }}
                >
                  <ExternalLink size={15} />
                  打开
                </Button>
                {live && (
                  <IconButton
                    disabled={busy}
                    label={`停止环境 ${profile.name}`}
                    icon={<Square size={16} />}
                    onClick={() =>
                      onRuntime('stop', { profile_id: profile.id })
                    }
                  />
                )}
                <IconButton
                  disabled={busy || live}
                  label={`编辑环境 ${profile.name}`}
                  icon={<Pencil size={16} />}
                  onClick={() => onEdit(profile)}
                />
                <IconButton
                  disabled={busy || live}
                  label={`删除环境配置 ${profile.name}`}
                  icon={<Trash2 size={16} />}
                  onClick={() => onDelete(profile.id)}
                />
              </div>
            </header>
            <dl className="environment-profile-meta">
              <div>
                <dt>网络出口</dt>
                <dd>
                  {data.proxies.find((proxy) => proxy.id === profile.proxy_id)
                    ?.name || '系统路由'}
                  {run?.resolved.ip && <code>{run.resolved.ip}</code>}
                </dd>
              </div>
              <div>
                <dt>语言与时区</dt>
                <dd>
                  {profile.locale_mode === 'proxy'
                    ? '语言跟随出口'
                    : profile.locale}
                  <span>
                    {profile.timezone_mode === 'proxy'
                      ? '时区跟随出口'
                      : profile.timezone}
                  </span>
                </dd>
              </div>
              <div>
                <dt>登录状态</dt>
                <dd>{session?.label || '首次使用请登录'}</dd>
              </div>
            </dl>
            {run && <BrowserLaunchReport run={run} />}
          </article>
        );
      })}
    </section>
  );
}
