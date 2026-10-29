import {
  Check,
  Circle,
  ExternalLink,
  LoaderCircle,
  LogIn,
  KeyRound,
  Settings2,
  ShieldCheck,
  Square,
} from 'lucide-react';
import type {
  BrowserAccount,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { runLabels } from '../lib/environment-settings';
import {
  clientIssue,
  type AccountActions,
  type AccountClient,
} from '../lib/account-view';
import { Button, FactsGrid } from './ui';
import { StatusBadge } from './form-controls';
import { BrowserLaunchReport } from './browser-launch-report';

export function AccountClientPanel({
  account,
  client,
  data,
  busy,
  onRuntime,
  onLogin,
  onSessionLogin,
  onEditProfile,
  onEditAccount,
  onManageBrowser,
}: Pick<
  AccountActions,
  | 'onRuntime'
  | 'onLogin'
  | 'onSessionLogin'
  | 'onEditProfile'
  | 'onEditAccount'
  | 'onManageBrowser'
> & {
  account: BrowserAccount;
  client: AccountClient;
  data: EnvironmentSettings;
  busy: boolean;
}) {
  const { profile, run, session, target } = client;
  const checking = run?.status === 'checking';
  const alive = !!run?.alive;
  const saved = session?.state === 'saved';
  const issue = clientIssue(client);
  const proxy = data.proxies.find((item) => item.id === profile?.proxy_id);
  const tone = issue
    ? 'error'
    : checking
      ? 'warning'
      : alive
        ? 'success'
        : 'neutral';
  const open = () => {
    if (target === 'app' && !saved && !alive) onLogin(account);
    else onRuntime('open', { account_id: account.id }, target);
  };
  const blockedCheck = run?.checks.some(
    (check) => check.policy === 'block' && check.state !== 'pass',
  );
  const progress = !run?.checks.length
    ? 0
    : !run.browser_checks.length && target === 'browser'
      ? 1
      : 2;
  return (
    <div className="account-client-panel">
      <div className="account-launch-bar">
        <div className="account-launch-status">
          <StatusBadge tone={tone}>
            {run ? runLabels[run.status] : profile ? '尚未启动' : '待绑定'}
          </StatusBadge>
          <span className="account-session-state">
            <ShieldCheck size={16} />
            {saved
              ? '登录凭据已保存'
              : session?.state === 'unavailable'
                ? '凭据待读取'
                : '尚未保存登录凭据'}
          </span>
        </div>
        <div className="account-launch-actions">
          {target === 'browser' && account.provider === 'claude' && profile && (
            <Button
              disabled={busy || checking || !client.available}
              onClick={() => onSessionLogin(account)}
            >
              <KeyRound size={16} />
              sessionKey 登录
            </Button>
          )}
          {(alive || checking) && profile && (
            <Button
              disabled={busy}
              onClick={() =>
                onRuntime('stop', { profile_id: profile.id }, target)
              }
            >
              <Square size={14} />
              {checking ? '取消启动' : '停止'}
            </Button>
          )}
          {profile ? (
            <Button
              variant="primary"
              className="account-open"
              disabled={busy || checking || !client.available}
              onClick={open}
            >
              {checking ? (
                <LoaderCircle className="account-spinner" size={17} />
              ) : alive || saved ? (
                <ExternalLink size={17} />
              ) : (
                <LogIn size={17} />
              )}
              {checking
                ? '正在检查'
                : alive
                  ? '切回窗口'
                  : saved
                    ? `打开${target === 'browser' ? '浏览器' : ' App'}`
                    : `登录${target === 'browser' ? '浏览器' : ' App'}`}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => onEditAccount(account)}
              disabled={busy}
            >
              绑定环境
            </Button>
          )}
        </div>
      </div>
      {checking && (
        <div
          className="account-launch-progress"
          role="status"
          aria-live="polite"
        >
          <div className="account-progress-steps">
            {['检查代理', '检查环境', '启动环境'].map((label, index) => (
              <span
                key={label}
                data-state={
                  index < progress
                    ? 'complete'
                    : index === progress
                      ? 'current'
                      : 'pending'
                }
              >
                {index < progress ? (
                  <Check size={15} />
                ) : index === progress ? (
                  <LoaderCircle className="account-spinner" size={15} />
                ) : (
                  <Circle size={12} />
                )}
                {label}
              </span>
            ))}
          </div>
          <p>{run?.stage}</p>
        </div>
      )}
      {issue && !checking && (
        <div className="account-issue" role="alert">
          <span>{issue}</span>
          {target === 'browser' && profile && !client.available && (
            <Button onClick={onManageBrowser} disabled={busy}>
              管理浏览器内核
            </Button>
          )}
          {profile && client.available && (
            <Button onClick={open} disabled={busy}>
              {blockedCheck ? '重新检查' : '重新打开'}
            </Button>
          )}
        </div>
      )}
      {profile && (
        <>
          <section className="account-environment-summary">
            <div className="account-section-heading">
              <h3>{profile.name}</h3>
              <Button
                variant="text"
                disabled={busy || alive || checking}
                title={alive ? '停止环境后可修改配置' : undefined}
                onClick={() =>
                  onEditProfile(
                    target === 'browser' ? 'profiles' : 'app_profiles',
                    profile.id,
                  )
                }
              >
                <Settings2 size={15} />
                配置环境
              </Button>
            </div>
            <FactsGrid
              items={[
                {
                  label: '专用代理',
                  value: proxy?.name || '系统路由',
                },
                {
                  label: '最近出口',
                  value: (
                    <span className="account-exit-ip">
                      {run?.resolved.ip || '尚未检测'}
                      {run?.resolved.country && (
                        <span>{run.resolved.country}</span>
                      )}
                    </span>
                  ),
                },
                {
                  label: '语言',
                  value:
                    profile.locale_mode === 'proxy'
                      ? run?.resolved.locale || '跟随代理'
                      : profile.locale,
                },
                {
                  label: '时区',
                  value:
                    profile.timezone_mode === 'proxy'
                      ? run?.resolved.timezone || '跟随代理'
                      : profile.timezone,
                },
              ]}
            />
          </section>
          {target === 'app' && (saved || alive) && (
            <div className="account-login-link">
              <Button
                onClick={() => onLogin(account)}
                disabled={busy || checking}
              >
                <LogIn size={16} />
                重新登录 App
              </Button>
            </div>
          )}
        </>
      )}
      {run && (
        <div className="account-check-details">
          <BrowserLaunchReport
            run={run}
            title="启动检查详情"
            showSummary={!checking && !issue}
          />
        </div>
      )}
    </div>
  );
}
