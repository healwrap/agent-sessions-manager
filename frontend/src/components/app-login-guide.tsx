import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { request } from '../lib/api';
import { isGuideDemo } from '../lib/demo-mode';
import type {
  BrowserAccount,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { Button, EditorDialog, Notice, StatusBadge, TextArea } from './ui';
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
  const [url, setUrl] = useState(
    isGuideDemo ? 'https://claude.ai/magic-link?demo=1' : '',
  );
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
      <Notice>
        <div className="app-login-guidance">
          <strong>此账号的所有访问都请在受控环境中完成</strong>
          <span>
            邮件中的登录、验证和账号操作链接，请复制到此账号的专用浏览器打开。
          </span>
          <span>
            Claude App 只从 Agent Sessions
            通过绑定代理启动，请勿无代理直接启动。
          </span>
        </div>
      </Notice>
      <ol className="app-login-steps">
        <li>
          <div>
            <h3>打开此账号的 Claude App</h3>
            {(!app || !browser) && <p>请先编辑账号，绑定 App 与浏览器环境。</p>}
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
            <h3>发起登录，复制邮件链接</h3>
            <p>
              在 App 选择邮箱登录，收取验证邮件并复制完整登录链接。 如果使用
              Google 等方式打开了系统浏览器，复制地址栏的完整链接，
              回到这里继续。
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
