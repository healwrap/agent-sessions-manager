import { useEffect, useRef, useState } from 'react';
import { request } from '../lib/api';
import type {
  BrowserAccount,
  BrowserProfile,
} from '../lib/environment-settings';
import { Button, EditorDialog, Field, Notice, TextInput } from './ui';

interface SessionJob {
  id: string;
  state: 'waiting' | 'verified' | 'failed' | 'cancelled';
  stage: string;
  error: string;
  email: string;
}

export function SessionLogin({
  account,
  profile,
  onClose,
}: {
  account: BrowserAccount;
  profile: BrowserProfile;
  onClose: () => void;
}) {
  const [secret, setSecret] = useState('');
  const [email, setEmail] = useState(() =>
    account.name.includes('@') ? account.name : '',
  );
  const [job, setJob] = useState<SessionJob>();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const mounted = useRef(false);
  const jobId = useRef('');
  const pending = submitting || job?.state === 'waiting';
  const verified = job?.state === 'verified';
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (jobId.current)
        void request(
          '/api/browser-session/cancel',
          {},
          { id: jobId.current },
        ).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!job?.id || job.state !== 'waiting') return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await request<SessionJob>(
          '/api/browser-session/' + job.id,
        );
        if (active) {
          setJob(next);
          setError('');
        }
      } catch (reason) {
        if (active) setError(String(reason));
      }
      if (active) timer = setTimeout(() => void poll(), 1000);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [job?.id, job?.state]);
  const login = async () => {
    setSubmitting(true);
    setError('');
    setJob(undefined);
    try {
      const next = await request<SessionJob>(
        '/api/browser-session/import',
        {},
        {
          account_id: account.id,
          session_key: secret,
          email,
        },
      );
      jobId.current = next.id;
      if (mounted.current) {
        setJob(next);
        setSecret('');
      } else await request('/api/browser-session/cancel', {}, { id: next.id });
    } catch (reason) {
      if (mounted.current) setError(String(reason));
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  };
  return (
    <EditorDialog
      title="sessionKey 登录浏览器"
      busy={false}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending && !verified && secret.trim()) void login();
      }}
      footer={
        <>
          <Button onClick={onClose}>{pending ? '取消登录' : '关闭'}</Button>
          {!verified && (
            <Button
              type="submit"
              variant="primary"
              disabled={pending || !secret.trim()}
            >
              {pending ? '正在登录…' : '导入并登录'}
            </Button>
          )}
        </>
      }
    >
      <strong>{profile.name}</strong>
      {!verified && (
        <>
          <Field label="账号邮箱（可选）" htmlFor="session-login-email">
            <TextInput
              id="session-login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
            />
          </Field>
          <Field label="sessionKey" htmlFor="session-login-key">
            <textarea
              id="session-login-key"
              className="form-input app-login-link"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              disabled={pending}
              placeholder="粘贴 sessionKey 或 sessionKey=完整值"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              required={!pending}
            />
          </Field>
        </>
      )}
      {job && (
        <Notice
          tone={
            verified ? 'success' : job.state === 'failed' ? 'error' : 'info'
          }
        >
          {job.error || job.stage}
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </EditorDialog>
  );
}
