import { useEffect, useRef, useState } from 'react';
import { request } from '../lib/api';
import { isGuideDemo } from '../lib/demo-mode';
import type { UsageAuthorizationJob } from '../lib/account-usage';
import type { BrowserAccount } from '../lib/environment-settings';
import { Button, EditorDialog, Field, Notice, TextArea } from './ui';

export function UsageAuthorization({
  account,
  onClose,
  onVerified,
}: {
  account: BrowserAccount;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [job, setJob] = useState<UsageAuthorizationJob>();
  const [code, setCode] = useState(isGuideDemo ? 'demo-code' : '');
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const mounted = useRef(false);
  const jobId = useRef('');
  const notified = useRef(false);
  const verifiedCallback = useRef(onVerified);
  verifiedCallback.current = onVerified;
  const verified = job?.state === 'verified';
  const waiting = job?.state === 'waiting';
  const pending =
    submitting || job?.state === 'preparing' || job?.state === 'verifying';
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (jobId.current)
        void request(
          '/api/account-usage/authorize-cancel',
          {},
          { id: jobId.current },
        ).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!job?.id || !['preparing', 'waiting', 'verifying'].includes(job.state))
      return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await request<UsageAuthorizationJob>(
          '/api/account-usage/authorization/' + job.id,
        );
        if (!active) return;
        setJob(next);
        setPollError('');
      } catch (reason) {
        if (active) setPollError(String(reason));
      }
      if (active) timer = setTimeout(() => void poll(), 1000);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [job?.id, job?.state]);
  useEffect(() => {
    if (verified && !notified.current) {
      notified.current = true;
      verifiedCallback.current();
    }
  }, [verified]);
  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const next = await request<UsageAuthorizationJob>(
        waiting
          ? '/api/account-usage/authorize-complete'
          : '/api/account-usage/authorize',
        {},
        waiting ? { id: job!.id, code } : { account_id: account.id },
      );
      jobId.current = next.id;
      if (mounted.current) {
        setJob(next);
        if (waiting) setCode('');
      } else
        await request(
          '/api/account-usage/authorize-cancel',
          {},
          { id: next.id },
        );
    } catch (reason) {
      if (mounted.current) setError(String(reason));
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  };
  return (
    <EditorDialog
      title="授权后台查询"
      busy={false}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending && !verified && (!waiting || code.trim())) void submit();
      }}
      footer={
        <>
          <Button onClick={onClose}>{verified ? '关闭' : '取消'}</Button>
          {!verified && (
            <Button
              variant="primary"
              type="submit"
              disabled={pending || (waiting && !code.trim())}
            >
              {pending
                ? job?.state === 'verifying'
                  ? '正在核对授权'
                  : '正在准备浏览器'
                : waiting
                  ? '完成授权'
                  : '打开授权页面'}
            </Button>
          )}
        </>
      }
    >
      <strong>{account.name}</strong>
      {!verified && (
        <p className="account-usage-empty">
          在此账号的独立浏览器中授权读取身份与用量，将结果页面的授权码粘贴到这里。
          授权保存到本机后，查询和续期会通过账号专用代理在后台完成。
        </p>
      )}
      {waiting && (
        <Field label="授权码" htmlFor="usage-authorization-code">
          <TextArea
            id="usage-authorization-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="粘贴授权码或 code#state"
            disabled={pending}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={3000}
          />
        </Field>
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
      {(error || pollError) && (
        <Notice tone="error">{error || pollError}</Notice>
      )}
    </EditorDialog>
  );
}
