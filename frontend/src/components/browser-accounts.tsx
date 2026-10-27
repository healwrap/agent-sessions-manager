import { useState } from 'react';
import {
  ExternalLink,
  Monitor,
  PanelsTopLeft,
  Pencil,
  Plus,
  Square,
  Trash2,
} from 'lucide-react';
import type {
  BrowserAccount,
  BrowserRun,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { browserAvailable, runLabels } from '../lib/environment-settings';
import { Button } from './primitives';
import { AgentIcon } from './agent-icon';
import { AccountEditor, type AccountRoute } from './account-editor';
import { BrowserLaunchReport } from './browser-launch-report';
import { KernelControl } from './kernel-control';
export function BrowserAccounts({
  data,
  busy,
  onSave,
  onDelete,
  onRuntime,
  onEditProfile,
  onInstall,
}: {
  data: EnvironmentSettings;
  busy: boolean;
  onSave: (account: BrowserAccount, route: AccountRoute) => Promise<void>;
  onDelete: (id: string) => void;
  onEditProfile: (kind: 'profiles' | 'app_profiles', id: string) => void;
  onRuntime: (
    action: 'open' | 'stop',
    body: { profile_id?: string; account_id?: string },
    target: 'browser' | 'app',
  ) => void;
  onInstall: () => void;
}) {
  const [edit, setEdit] = useState<{ item?: BrowserAccount }>();
  const renderReport = (run: BrowserRun, target: string) => (
    <details
      className="account-launch-details"
      key={target + run.profile_id}
      open={['checking', 'blocked', 'failed', 'interrupted'].includes(
        run.status,
      )}
    >
      <summary>
        {target} · {runLabels[run.status]} · 查看启动检查
      </summary>
      <BrowserLaunchReport run={run} />
    </details>
  );
  return (
    <>
      {data.app_runtime.warnings?.map((message) => (
        <p className="environment-error-bar" role="alert" key={message}>
          {message}
        </p>
      ))}
      {!data.browser.kernel.available && (
        <KernelControl kernel={data.browser.kernel} onInstall={onInstall} />
      )}
      <div className="account-list-heading">
        <span>{data.accounts.length} 个账号</span>
        <Button variant="primary" onClick={() => setEdit({})} disabled={busy}>
          <Plus size={15} />
          添加账号
        </Button>
      </div>
      {!data.accounts.length && (
        <section className="environment-panel environment-empty">
          <h3>添加第一个账号</h3>
          <p>
            一次创建账号及所需的浏览器、App
            环境，然后分别打开登录。以后切换账号会使用各自保存的登录状态。
          </p>
          <Button onClick={() => setEdit({})} disabled={busy}>
            <Plus size={15} />
            添加账号与环境
          </Button>
        </section>
      )}
      <div className="account-list">
        {data.accounts.map((account) => {
          const browser = data.profiles.find(
            (row) => row.id === account.profile_id,
          );
          const app = data.app_profiles.find(
            (row) => row.id === account.app_profile_id,
          );
          const browserRun = data.browser.runs.find(
            (row) => row.profile_id === account.profile_id,
          );
          const appRun = data.app_runtime.runs.find(
            (row) => row.profile_id === account.app_profile_id,
          );
          const live = [browserRun, appRun].some(
            (run) => run?.alive || run?.status === 'checking',
          );
          return (
            <section
              className="environment-panel account-card"
              key={account.id}
            >
              <header className="account-card-heading">
                <AgentIcon source={account.provider} />
                <div>
                  <h2>{account.name}</h2>
                  <span>
                    {account.provider === 'claude' ? 'Claude' : 'Codex'}
                  </span>
                </div>
                <div className="environment-row-actions">
                  <button
                    disabled={busy || live}
                    aria-label={`编辑账号 ${account.name}`}
                    onClick={() => setEdit({ item: account })}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    disabled={busy || live}
                    aria-label={`删除账号 ${account.name}`}
                    onClick={() => onDelete(account.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </header>
              {(
                [
                  {
                    target: 'browser',
                    profile: browser,
                    run: browserRun,
                    label: '独立浏览器',
                    icon: PanelsTopLeft,
                  },
                  ...(account.provider === 'claude'
                    ? [
                        {
                          target: 'app',
                          profile: app,
                          run: appRun,
                          label: 'Claude App',
                          icon: Monitor,
                        },
                      ]
                    : []),
                ] as const
              ).map(({ target, profile, run, label, icon: Icon }) => (
                <div className="account-client-row" key={target}>
                  <Icon size={18} />
                  <div>
                    <strong>{label}</strong>
                    <p>{profile?.name || '尚未绑定环境'}</p>
                    <small>
                      {profile
                        ? (target === 'browser'
                            ? data.browser.sessions?.[profile.id]
                            : data.app_runtime.sessions[profile.id]
                          )?.label || '首次使用请登录'
                        : '编辑账号以创建或绑定环境'}
                      {run ? ` · ${runLabels[run.status]}` : ''}
                    </small>
                  </div>
                  {profile && (
                    <div className="account-client-actions">
                      <Button
                        variant="text"
                        disabled={
                          busy || run?.alive || run?.status === 'checking'
                        }
                        onClick={() =>
                          onEditProfile(
                            target === 'browser' ? 'profiles' : 'app_profiles',
                            profile.id,
                          )
                        }
                      >
                        环境设置
                      </Button>
                      <Button
                        disabled={
                          busy ||
                          run?.status === 'checking' ||
                          (target === 'browser' &&
                            !browserAvailable(data, browser))
                        }
                        onClick={() =>
                          onRuntime(
                            'open',
                            { account_id: account.id },
                            target as 'browser' | 'app',
                          )
                        }
                      >
                        <ExternalLink size={14} />
                        {run?.status === 'checking'
                          ? '正在检查…'
                          : target === 'browser'
                            ? '打开浏览器'
                            : '打开 App'}
                      </Button>
                      {(run?.alive || run?.status === 'checking') && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            onRuntime(
                              'stop',
                              { profile_id: profile.id },
                              target as 'browser' | 'app',
                            )
                          }
                        >
                          <Square size={13} />
                          停止
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {browserRun && renderReport(browserRun, '浏览器')}
              {appRun && renderReport(appRun, 'Claude App')}
            </section>
          );
        })}
      </div>
      <p className="environment-footnote">
        首次打开后完成官方登录；本地登录状态自动保存。浏览器与 App
        的登录状态分别管理。
      </p>
      {edit && (
        <AccountEditor
          account={edit.item}
          data={data}
          busy={busy}
          onSave={onSave}
          onClose={() => setEdit(undefined)}
        />
      )}
    </>
  );
}
