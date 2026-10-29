import { useEffect, useState } from 'react';
import type {
  EnvironmentSection,
  EnvironmentSettings,
  ProxyConfig,
} from '../lib/environment-settings';
import type { ClaudeReport } from '../lib/claude-diagnostics';
import { guideSteps } from '../lib/guide-steps';
import { guideStore, useGuide } from '../state/guide-store';
import { sessionStore } from '../state/session-store';
import { Button, GuidedTour, Notice, Select, type GuidedStep } from './ui';
import { GuideLoginCheck } from './guide-login-check';
import { isGuideDemo } from '../lib/demo-mode';

export interface GuideNetworkResult {
  proxyId: string;
  proxyUrl: string;
  report: ClaudeReport | null;
}
export function AccountGuide({
  data,
  loading,
  active,
  section,
  proxyEditing,
  accountEditing,
  diagnostic,
  network,
  appLoginId,
  animations,
  onSection,
  onExpand,
  onProxy,
  onAccount,
  onInspect,
  onCloseDiagnostic,
  onCloseLogin,
}: {
  data: EnvironmentSettings;
  loading: boolean;
  active: boolean;
  section: EnvironmentSection;
  proxyEditing: boolean;
  accountEditing: boolean;
  diagnostic?: ProxyConfig;
  network?: GuideNetworkResult;
  appLoginId: string;
  animations: boolean;
  onSection: (section: EnvironmentSection) => void;
  onExpand: () => void;
  onProxy: () => void;
  onAccount: () => void;
  onInspect: (proxy: ProxyConfig) => void;
  onCloseDiagnostic: () => void;
  onCloseLogin: () => void;
}) {
  const guide = useGuide();
  const progress = guide.progress;
  const [existing, setExisting] = useState('');
  const account = data.accounts.find((row) => row.id === progress?.accountId);
  const proxy = data.proxies.find((row) => row.id === progress?.proxyId);
  const target = progress?.target || 'browser';
  const profileId =
    target === 'app' ? account?.app_profile_id : account?.profile_id;
  const run = (
    target === 'app' ? data.app_runtime.runs : data.browser.runs
  ).find((row) => row.profile_id === profileId);
  const enabled = active && guide.active && !!progress && !loading;
  const missingKernel =
    !!profileId && target === 'browser' && !data.browser.kernel.available;
  const missingApp =
    !!profileId &&
    target === 'app' &&
    !data.apps.some((row) => row.id === 'claude');
  useEffect(() => {
    if (!active && guide.active) guideStore.pause();
  }, [active, guide.active]);
  useEffect(() => {
    if (!enabled || !progress) return;
    if (progress.step === 'proxy-nav') onExpand();
    if (progress.step.startsWith('proxy-') && progress.step !== 'proxy-nav')
      onSection('proxies');
    if (
      progress.step.startsWith('account-') ||
      progress.step === 'switch-pick' ||
      progress.step === 'done'
    )
      onSection(
        missingKernel && progress.step === 'account-open'
          ? 'browser'
          : 'accounts',
      );
    if (progress.step === 'done' && appLoginId) onCloseLogin();
  }, [enabled, progress?.step, missingKernel]);
  useEffect(() => {
    if (!enabled || !progress) return;
    const step = progress.step;
    if (step === 'proxy-nav' && section === 'proxies')
      guideStore.go('proxy-add');
    if (step === 'proxy-add' && proxyEditing) guideStore.go('proxy-form');
    if (step === 'proxy-test' && diagnostic?.id === progress.proxyId)
      guideStore.go('proxy-result');
    if (step === 'account-add' && accountEditing) guideStore.go('account-form');
    if (step === 'account-open' && accountEditing && !profileId)
      guideStore.go('account-form');
    if (step === 'account-open' && run?.alive && run.status === 'running')
      guideStore.go(progress.topic === 'switch' ? 'done' : 'login');
    if (
      step === 'switch-stop' &&
      account &&
      !run?.alive &&
      run?.status !== 'checking'
    )
      guideStore.go('switch-pick');
  }, [
    enabled,
    progress,
    section,
    proxyEditing,
    accountEditing,
    diagnostic,
    run,
    account,
    profileId,
  ]);
  if (!enabled || !progress) return null;
  const id = progress.step;
  const scope = account
    ? '[data-guide-account-id="' +
      CSS.escape(account.id) +
      '"] [data-guide-target="' +
      target +
      '"] '
    : '';
  const selectors: Record<typeof id, string> = {
    'proxy-nav': '[data-guide="proxy-nav"]',
    'proxy-add': '[data-guide="proxy-add"]',
    'proxy-form': '[data-guide="proxy-editor"]',
    'proxy-test':
      '[data-guide-proxy-id="' + CSS.escape(progress.proxyId || '') + '"]',
    'proxy-result': '[data-guide="proxy-diagnostic-form"]',
    'account-add': '[data-guide="account-add"]',
    'account-form': '[data-guide="account-editor"]',
    'account-open': scope + '[data-guide="account-open"]',
    login: scope + '[data-guide="account-login"]',
    'switch-stop': scope + '[data-guide="account-stop"]',
    'switch-pick': '[data-guide="account-list"]',
    done:
      '[data-guide-account-id="' + CSS.escape(progress.accountId || '') + '"]',
  };
  const reveal = () => {
    if (id.startsWith('proxy-')) {
      onSection('proxies');
      if (id === 'proxy-form') onProxy();
      if ((id === 'proxy-test' || id === 'proxy-result') && proxy)
        onInspect(proxy);
    } else {
      onSection(missingKernel ? 'browser' : 'accounts');
      if (id === 'account-form') onAccount();
    }
  };
  const definition = guideSteps[id];
  const step: GuidedStep = {
    id,
    selector: selectors[id],
    title: definition.title,
    chapter: definition.chapter,
    body: <p>{definition.hint}</p>,
  };
  if (id === 'proxy-nav' || id === 'proxy-add') {
    step.body = (
      <>
        <p>{definition.hint}</p>
        {data.proxies.length > 0 && (
          <>
            <Select
              label="使用已有代理"
              value={existing || data.proxies[0].id}
              onChange={setExisting}
              options={data.proxies.map((row) => ({
                value: row.id,
                label: row.name,
              }))}
            />
            <Button
              onClick={() => {
                onSection('proxies');
                guideStore.go('proxy-test', {
                  proxyId: existing || data.proxies[0].id,
                });
              }}
            >
              使用这个代理
            </Button>
          </>
        )}
      </>
    );
  }
  if (id === 'proxy-result') {
    const report =
      network?.proxyId === proxy?.id && network?.proxyUrl === proxy?.url
        ? network?.report
        : null;
    const passed =
      !!report?.exits.claude.ip &&
      report.checks.some(
        (row) => row.id === 'claude-trace' && row.state === 'pass',
      );
    if (passed) {
      step.selector = '[data-guide="proxy-diagnostic-exits"]';
      step.popover = { side: 'top', align: 'end' };
    }
    step.body = (
      <>
        {passed ? (
          <p>
            {report!.exits.claude.ip} ·{' '}
            {report!.exits.claude.country || '地区待确认'}
          </p>
        ) : (
          <p>检测未通过，请重试。</p>
        )}
      </>
    );
    if (passed) {
      step.onContinue = () => {
        onCloseDiagnostic();
        if (progress.topic === 'proxy') guideStore.finish();
        else {
          onSection('accounts');
          guideStore.go('account-add');
        }
      };
      step.continueLabel = progress.topic === 'proxy' ? '完成' : '添加账号';
    }
  }
  if (id === 'account-open' && (missingKernel || missingApp)) {
    step.id += '-component';
    step.selector = missingKernel
      ? '.kernel-control'
      : '[data-guide="account-toolbar"]';
    step.body = (
      <>
        <p>请先安装{missingKernel ? '浏览器内核' : 'Claude App'}。</p>
        {missingApp && (
          <Button
            onClick={() => {
              guideStore.pause();
              sessionStore.update({ settingsOpen: true });
            }}
          >
            打开设置
          </Button>
        )}
      </>
    );
  }
  if (id === 'account-open' && account && !profileId) {
    step.selector = selectors[id];
    step.body = <p>点击「绑定环境」，创建或选择一个环境。</p>;
  }
  if (id === 'login' && account) {
    if (target === 'app' && appLoginId === account.id)
      step.selector = 'dialog[aria-label="Claude App 登录引导"]';
    step.body = (
      <>
        <p>
          {isGuideDemo
            ? '体验模拟登录，无需输入真实邮箱或验证码。'
            : definition.hint}
        </p>
        <GuideLoginCheck
          key={account.id + target}
          account={account}
          target={target}
          ready={!!run?.alive && run.status === 'running'}
        />
      </>
    );
  }
  if (id === 'account-open' && appLoginId === account?.id)
    step.selector = 'dialog[aria-label="Claude App 登录引导"]';
  if (id === 'switch-pick' && data.accounts.length < 2)
    step.body = (
      <>
        <p>先添加另一个账号。</p>
        <Button
          onClick={() => {
            guideStore.go('account-add');
            onAccount();
          }}
        >
          添加另一个账号
        </Button>
      </>
    );
  if (id === 'done') {
    if (isGuideDemo)
      step.body = <p>演示已完成。可以继续体验，或退出后配置自己的账号。</p>;
    if (!account) step.selector = '[data-guide="account-toolbar"]';
    step.onContinue = guideStore.finish;
    step.continueLabel = '完成';
  }
  if ((id === 'proxy-test' || id === 'proxy-result') && !proxy) {
    step.selector = '[data-guide="proxy-add"]';
    step.body = <Notice>代理已移除，请重新选择。</Notice>;
    step.onContinue = () => guideStore.go('proxy-nav', { proxyId: undefined });
    step.continueLabel = '重新选择';
  }
  if (
    ((id.startsWith('account-') &&
      id !== 'account-add' &&
      id !== 'account-form') ||
      id === 'login' ||
      id === 'switch-stop') &&
    !account
  ) {
    step.selector = '[data-guide="account-toolbar"]';
    step.body = <Notice>账号已移除，请重新添加。</Notice>;
    step.onContinue = () => guideStore.go('account-add');
    step.continueLabel = '添加账号';
  }
  return (
    <GuidedTour
      step={step}
      animations={animations}
      onPause={guideStore.pause}
      onReveal={reveal}
    />
  );
}
