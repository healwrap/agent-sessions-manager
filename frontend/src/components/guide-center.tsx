import { useState } from 'react';
import type { WorkspacePage } from '../workspace';
import {
  guideStore,
  guideTopics,
  useGuide,
  type GuideTopic,
} from '../state/guide-store';
import { useEnvironmentSettings } from '../hooks/use-environment-settings';
import { accountGuide, proxyGuide } from '../lib/guide-links';
import {
  Button,
  ContentDialog,
  Disclosure,
  Field,
  GuideLink,
  Notice,
  Select,
} from './ui';

export function GuideCenter({
  onNavigate,
}: {
  onNavigate: (page: WorkspacePage) => void;
}) {
  const { helpOpen, progress } = useGuide();
  const { data, loading, error } = useEnvironmentSettings(helpOpen, false);
  const [accountId, setAccountId] = useState('');
  const [target, setTarget] = useState('browser');
  const [detail, setDetail] = useState<'login' | 'switch'>();
  if (!helpOpen) return null;
  const selected =
    data.accounts.find((item) => item.id === accountId) || data.accounts[0];
  const close = () => {
    setDetail(undefined);
    guideStore.closeHelp();
  };
  const start = (topic: GuideTopic) => {
    setDetail(undefined);
    guideStore.start(
      topic,
      selected?.id,
      selected?.provider === 'claude'
        ? (target as 'browser' | 'app')
        : 'browser',
    );
    onNavigate('accounts');
  };
  const resume = () => {
    setDetail(undefined);
    guideStore.resume();
    onNavigate('accounts');
  };
  return (
    <ContentDialog
      title="帮助与引导"
      className="guide-center-dialog"
      onClose={close}
      footer={
        <>
          {progress && (
            <Button
              variant="ghost"
              disabled={loading}
              onClick={() => start('setup')}
            >
              重新开始
            </Button>
          )}
          <Button
            variant="primary"
            disabled={loading}
            onClick={() => (progress ? resume() : start('setup'))}
          >
            {progress ? '继续引导' : '开始引导'}
          </Button>
        </>
      }
    >
      <p className="guide-summary">
        {progress
          ? `上次：${guideTopics[progress.topic]}`
          : '代理 → 账号 → 登录'}
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <GuideLink {...accountGuide} />
      <GuideLink href={proxyGuide.href} title={proxyGuide.title} />
      <Disclosure title="单项引导">
        <div className="ui-actions guide-shortcuts">
          <Button disabled={loading} onClick={() => start('proxy')}>
            代理配置
          </Button>
          <Button disabled={loading} onClick={() => start('account')}>
            添加账号
          </Button>
          {data.accounts.length > 0 && (
            <>
              <Button
                aria-pressed={detail === 'login'}
                onClick={() => setDetail('login')}
              >
                登录账号
              </Button>
              <Button
                aria-pressed={detail === 'switch'}
                onClick={() => setDetail('switch')}
              >
                切换账号
              </Button>
            </>
          )}
        </div>
        {detail && (
          <div className="ui-stack">
            <Field label="账号">
              <Select
                label="引导账号"
                value={selected?.id || ''}
                options={data.accounts.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                onChange={(id) => {
                  setAccountId(id);
                  setTarget('browser');
                }}
              />
            </Field>
            {selected?.provider === 'claude' && (
              <Field label="使用方式">
                <Select
                  label="引导使用方式"
                  value={target}
                  onChange={setTarget}
                  options={[
                    { value: 'browser', label: '独立浏览器' },
                    { value: 'app', label: 'Claude App' },
                  ]}
                />
              </Field>
            )}
            <Button onClick={() => start(detail)}>
              开始{detail === 'login' ? '登录' : '切号'}引导
            </Button>
          </div>
        )}
      </Disclosure>
      <Disclosure title="使用提示">
        <p>邮件登录链接在对应账号的浏览器中打开。</p>
        <p>切号先停止环境，无需退出网站账号。</p>
        <p>修改代理前，先停止使用它的环境。</p>
      </Disclosure>
    </ContentDialog>
  );
}
