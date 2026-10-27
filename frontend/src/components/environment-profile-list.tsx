import { ExternalLink, Pencil, Square, Trash2 } from 'lucide-react';
import type {
  AppProfile,
  BrowserProfile,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { browserAvailable, runLabels } from '../lib/environment-settings';
import { AgentIcon } from './agent-icon';
import { Button } from './primitives';
import { BrowserLaunchReport } from './browser-launch-report';
export function EnvironmentProfileList({
  data,
  target,
  busy,
  onEdit,
  onDelete,
  onRuntime,
}: {
  data: EnvironmentSettings;
  target: 'browser' | 'app';
  busy: boolean;
  onEdit: (profile: BrowserProfile | AppProfile) => void;
  onDelete: (id: string) => void;
  onRuntime: (action: 'open' | 'stop', body: { profile_id: string }) => void;
}) {
  const profiles = target === 'browser' ? data.profiles : data.app_profiles;
  const runtime = target === 'browser' ? data.browser : data.app_runtime;
  return (
    <section className="environment-panel">
      <header className="environment-panel-heading">
        <h2>
          独立环境 <span>{profiles.length}</span>
        </h2>
        <span className="environment-muted">
          {target === 'browser'
            ? '独立浏览器登录数据'
            : '官方 App 登录数据与 Code 配置'}
        </span>
      </header>
      <div className="environment-table-wrap">
        <table className="environment-table">
          <thead>
            <tr>
              <th>环境 / 绑定账号</th>
              <th>网络出口</th>
              <th>语言 / 时区</th>
              <th>登录与运行状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => {
              const run = runtime.runs.find(
                (row) => row.profile_id === profile.id,
              );
              const live = run?.alive || run?.status === 'checking';
              const account = data.accounts.find(
                (row) =>
                  (target === 'browser'
                    ? row.profile_id
                    : row.app_profile_id) === profile.id,
              );
              return (
                <tr key={profile.id}>
                  <td>
                    <span className="environment-name">
                      <AgentIcon
                        source={
                          target === 'browser'
                            ? (profile as BrowserProfile).provider
                            : 'claude'
                        }
                      />
                      <strong>{profile.name}</strong>
                    </span>
                    <small>{account?.name || '尚未绑定账号'}</small>
                  </td>
                  <td>
                    {data.proxies.find((proxy) => proxy.id === profile.proxy_id)
                      ?.name || '系统路由'}
                    <small>{run?.resolved.ip || '启动时检测出口'}</small>
                  </td>
                  <td>
                    {profile.locale_mode === 'proxy'
                      ? '语言跟随出口'
                      : profile.locale}
                    <small>
                      {profile.timezone_mode === 'proxy'
                        ? '时区跟随出口'
                        : profile.timezone}
                    </small>
                  </td>
                  <td>
                    {runtime.sessions?.[profile.id]?.label || '首次使用请登录'}
                    <small>{run ? runLabels[run.status] : '尚未启动'}</small>
                  </td>
                  <td>
                    <div className="environment-row-actions">
                      <Button
                        disabled={
                          busy ||
                          run?.status === 'checking' ||
                          (target === 'browser' &&
                            !browserAvailable(data, profile as BrowserProfile))
                        }
                        onClick={() =>
                          onRuntime('open', { profile_id: profile.id })
                        }
                      >
                        <ExternalLink size={13} />
                        打开
                      </Button>
                      {live && (
                        <button
                          disabled={busy}
                          aria-label={`停止环境 ${profile.name}`}
                          onClick={() =>
                            onRuntime('stop', { profile_id: profile.id })
                          }
                        >
                          <Square size={14} />
                        </button>
                      )}
                      <button
                        disabled={busy || live}
                        aria-label={`编辑环境 ${profile.name}`}
                        onClick={() => onEdit(profile)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        disabled={busy || live}
                        aria-label={`删除环境配置 ${profile.name}`}
                        onClick={() => onDelete(profile.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!profiles.length && (
        <div className="environment-empty">
          <h3>还没有{target === 'browser' ? '浏览器' : 'App'}环境</h3>
          <p>
            在账号管理添加账号时，可以自动创建独立环境，也可以在这里提前配置。
          </p>
        </div>
      )}
      {runtime.runs
        .filter((run) =>
          profiles.some((profile) => profile.id === run.profile_id),
        )
        .map((run) => (
          <details
            className="account-launch-details"
            key={run.profile_id}
            open={['failed', 'blocked', 'interrupted'].includes(run.status)}
          >
            <summary>
              {run.name} · {runLabels[run.status]} · 启动检查
            </summary>
            <BrowserLaunchReport run={run} />
          </details>
        ))}
      <footer className="environment-panel-note">
        关闭或切换环境后保留登录状态；删除配置会保留环境中的浏览数据。
      </footer>
    </section>
  );
}
