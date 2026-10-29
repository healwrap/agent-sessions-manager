import { useState } from 'react';
import type { BrowserAccount } from '../lib/environment-settings';
import { request } from '../lib/api';
import { guideStore } from '../state/guide-store';
import { Button, Notice } from './ui';

interface Identity {
  state: 'pending' | 'verified' | 'mismatch';
  email?: string;
  matches?: boolean | null;
  message: string;
}
export function GuideLoginCheck({
  account,
  target,
  ready,
}: {
  account: BrowserAccount;
  target: 'browser' | 'app';
  ready: boolean;
}) {
  const [result, setResult] = useState<Identity>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inspect = async () => {
    const progress = guideStore.state.progress;
    setBusy(true);
    setResult(undefined);
    setError('');
    try {
      const value = await request<Identity>('/api/browser-login', {
        account_id: account.id,
      });
      setResult(value);
      if (
        value.state === 'verified' &&
        value.matches === true &&
        guideStore.state.active &&
        guideStore.state.progress === progress
      )
        guideStore.go('done');
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  if (target === 'app' || account.provider !== 'claude')
    return (
      <>
        <p>
          请在{target === 'app' ? '此账号的 App' : '绑定浏览器'}
          中核对当前账号，浏览器和 App 的登录结果分别确认。
        </p>
        <Button disabled={!ready} onClick={() => guideStore.go('done')}>
          我已在窗口确认登录
        </Button>
      </>
    );
  return (
    <>
      <Button disabled={!ready || busy} onClick={() => void inspect()}>
        {busy ? '正在核对…' : '检查登录身份'}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
      {result && (
        <Notice tone={result.state === 'mismatch' ? 'error' : 'info'}>
          {result.message}
        </Notice>
      )}
      {result?.state === 'verified' && result.matches === null && (
        <Button onClick={() => guideStore.go('done')}>确认使用此邮箱</Button>
      )}
    </>
  );
}
