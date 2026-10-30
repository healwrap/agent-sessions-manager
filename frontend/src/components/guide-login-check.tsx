import { useState } from 'react';
import type { BrowserAccount } from '../lib/environment-settings';
import { request } from '../lib/api';
import { guideStore } from '../state/guide-store';
import { isGuideDemo } from '../lib/demo-mode';
import { Button, Notice, toast } from './ui';

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
  const [busy, setBusy] = useState(false);
  const inspect = async () => {
    const progress = guideStore.state.progress;
    setBusy(true);
    setResult(undefined);
    try {
      const value = await request<Identity>(
        isGuideDemo ? '/api/demo/login' : '/api/browser-login',
        {
          account_id: account.id,
          ...(isGuideDemo ? { target } : {}),
        },
      );
      setResult(value);
      if (
        value.state === 'verified' &&
        value.matches === true &&
        guideStore.state.active &&
        guideStore.state.progress === progress
      )
        guideStore.go('done');
    } catch (reason) {
      toast(String(reason), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  if (!isGuideDemo && (target === 'app' || account.provider !== 'claude'))
    return (
      <>
        <p>在{target === 'app' ? 'App' : '浏览器'}内确认当前账号。</p>
        <Button disabled={!ready} onClick={() => guideStore.go('done')}>
          我已确认登录
        </Button>
      </>
    );
  return (
    <>
      <Button disabled={!ready || busy} onClick={() => void inspect()}>
        {busy
          ? '正在核对…'
          : isGuideDemo
            ? target === 'app'
              ? '模拟 App 登录'
              : '模拟邮箱登录'
            : '检查登录身份'}
      </Button>
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
