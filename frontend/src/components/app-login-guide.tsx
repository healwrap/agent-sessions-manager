import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { request } from '../lib/api';
import type {
  BrowserAccount,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { Button, EditorDialog, StatusBadge, TextArea } from './ui';
import { BrowserLaunchReport } from './browser-launch-report';
import '../styles/app-login-guide.css';

interface LoginJob {
  id: string;
  state: 'waiting' | 'opened' | 'failed' | 'cancelled';
  stage: string;
  error: string;
}

export function AppLoginGuide({
  account,
  data,
  onClose,
}: {
  account: BrowserAccount;
  data: EnvironmentSettings;
  onClose: () => void;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [openingApp, setOpeningApp] = useState(false);
  const [job, setJob] = useState<LoginJob>();
  const mounted = useRef(false);
  const jobId = useRef('');
  const browser = data.profiles.find((row) => row.id === account.profile_id);
  const app = data.app_profiles.find(
    (row) => row.id === account.app_profile_id,
  );
  const appRun = data.app_runtime.runs.find(
    (row) => row.profile_id === app?.id,
  );
  const browserRun = data.browser.runs.find(
    (row) => row.profile_id === browser?.id,
  );
  const appReady = appRun?.alive && appRun.status === 'running';
  const appChecking = appRun?.status === 'checking';
  const pending = submitting || job?.state === 'waiting';
  const opened = job?.state === 'opened';
  const session = app && data.app_runtime.sessions[app.id];

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (jobId.current)
        void request('/api/app-login/cancel', {}, { id: jobId.current }).catch(
          () => {},
        );
    };
  }, []);
  useEffect(() => {
    if (!job?.id || job.state !== 'waiting') return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await request<LoginJob>('/api/app-login/' + job.id);
        if (active) {
          setJob(next);
          setError('');
        }
      } catch (reason) {
        if (active) setError(String(reason));
      }
      if (active) timer = setTimeout(() => void poll(), 750);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [job?.id, job?.state]);

  const openApp = async () => {
    setOpeningApp(true);
    setError('');
    try {
      await request('/api/app-runtime/open', {}, { account_id: account.id });
    } catch (reason) {
      if (mounted.current) setError(String(reason));
    } finally {
      if (mounted.current) setOpeningApp(false);
    }
  };
  const continueLogin = async () => {
    setSubmitting(true);
    setError('');
    setJob(undefined);
    try {
      const next = await request<LoginJob>(
        '/api/app-login/open',
        {},
        { account_id: account.id, url },
      );
      jobId.current = next.id;
      if (mounted.current) setJob(next);
      else await request('/api/app-login/cancel', {}, { id: next.id });
    } catch (reason) {
      if (mounted.current) setError(String(reason));
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  };
  return (
    <EditorDialog
      title="Claude App 登录引导"
      busy={false}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending && !opened && appReady && url.trim()) void continueLogin();
      }}
      footer={
        <>
          <Button onClick={onClose}>
            {pending ? '取消打开链接' : '关闭引导'}
          </Button>
          {opened ? (
            <Button
              variant="primary"
              onClick={() => void openApp()}
              disabled={!appReady || openingApp}
            >
              返回 Claude App
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              disabled={pending || !appReady || !browser || !url.trim()}
            >
              {pending ? '正在打开…' : '在绑定浏览器中继续'}
            </Button>
          )}
        </>
      }
    >
      <div className="app-login-context">
        <strong>{account.name}</strong>
        <span>浏览器：{browser?.name || '尚未绑定'}</span>
      </div>
      <ol className="app-login-steps">
        <li>
          <div>
            <h3>打开此账号的 Claude App</h3>
            <p>{app?.name || '请先编辑账号，绑定 App 与浏览器环境。'}</p>
            <Button
              onClick={() => void openApp()}
              disabled={
                !app || !browser || openingApp || appChecking || pending
              }
            >
              <ExternalLink size={15} />
              {openingApp || appChecking
                ? '正在检查 App…'
                : appReady
                  ? '显示 Claude App'
                  : '打开 Claude App'}
            </Button>
            {appRun && <p role="status">{appRun.error || appRun.stage}</p>}
          </div>
        </li>
        <li>
          <div>
            <h3>发起登录，复制链接</h3>
            <p>
              在 App
              点击登录。系统浏览器打开后，复制地址栏的完整链接，先不要在那里填写登录信息。
            </p>
          </div>
        </li>
        <li>
          <div>
            <h3>在绑定的浏览器里完成登录</h3>
            <label className="app-login-field">
              完整登录链接
              <TextArea
                className="app-login-link"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="粘贴刚复制的 https:// 登录链接"
                aria-label="完整登录链接"
                autoCapitalize="off"
                autoComplete="off"
                spellCheck={false}
                disabled={pending || opened}
              />
            </label>
            <p>完成网页认证后，允许页面打开 Claude App，并回到原 App 确认。</p>
          </div>
        </li>
      </ol>
      {job && (
        <div className="app-login-progress" role="status">
          <StatusBadge
            tone={
              opened ? 'success' : job.state === 'failed' ? 'error' : 'neutral'
            }
          >
            {opened
              ? '链接已打开'
              : job.state === 'failed'
                ? '未打开'
                : '检查中'}
          </StatusBadge>
          <span>
            {opened
              ? `请在「${browser?.name}」完成认证，再返回 Claude App。`
              : job.stage}
          </span>
        </div>
      )}
      {(error || job?.error) && (
        <p className="environment-error-bar" role="alert">
          {error || job?.error}
        </p>
      )}
      {job?.state === 'failed' && browserRun && (
        <BrowserLaunchReport run={browserRun} title="浏览器启动检查" />
      )}
      {opened && session?.state === 'saved' && (
        <StatusBadge tone="success">App 已保存登录状态</StatusBadge>
      )}
    </EditorDialog>
  );
}
