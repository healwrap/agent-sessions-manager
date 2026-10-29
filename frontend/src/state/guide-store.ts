import { useSyncExternalStore } from 'react';

export const guideTopics = {
  setup: '首次配置',
  proxy: '代理配置',
  account: '添加账号',
  login: '首次登录',
  switch: '切换账号',
} as const;
export type GuideTopic = keyof typeof guideTopics;
export type GuideStep =
  | 'proxy-nav'
  | 'proxy-add'
  | 'proxy-form'
  | 'proxy-test'
  | 'proxy-result'
  | 'account-add'
  | 'account-form'
  | 'account-open'
  | 'login'
  | 'switch-stop'
  | 'switch-pick'
  | 'done';
export interface GuideProgress {
  version: 1;
  topic: GuideTopic;
  step: GuideStep;
  proxyId?: string;
  accountId?: string;
  target: 'browser' | 'app';
}
const key = 'agent-sessions.guide.v1';
const steps: GuideStep[] = [
  'proxy-nav',
  'proxy-add',
  'proxy-form',
  'proxy-test',
  'proxy-result',
  'account-add',
  'account-form',
  'account-open',
  'login',
  'switch-stop',
  'switch-pick',
  'done',
];
function read(): GuideProgress | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (
      value?.version !== 1 ||
      !Object.hasOwn(guideTopics, value.topic) ||
      !steps.includes(value.step) ||
      !['browser', 'app'].includes(value.target)
    )
      return null;
    return {
      version: 1,
      topic: value.topic,
      step: value.step,
      target: value.target,
      ...(typeof value.proxyId === 'string' ? { proxyId: value.proxyId } : {}),
      ...(typeof value.accountId === 'string'
        ? { accountId: value.accountId }
        : {}),
    };
  } catch {
    return null;
  }
}
let state = { helpOpen: false, active: false, progress: read() };
const listeners = new Set<() => void>();
function update(patch: Partial<typeof state>) {
  state = { ...state, ...patch };
  try {
    if (state.progress)
      localStorage.setItem(key, JSON.stringify(state.progress));
    else localStorage.removeItem(key);
  } catch {
    /* The current guide still works when local storage is unavailable. */
  }
  listeners.forEach((listener) => listener());
}
export const guideStore = {
  get state() {
    return state;
  },
  help: () => update({ active: false, helpOpen: true }),
  closeHelp: () => update({ helpOpen: false }),
  pause: () => update({ active: false }),
  finish: () => update({ active: false, progress: null }),
  start(
    topic: GuideTopic,
    accountId?: string,
    target: 'browser' | 'app' = 'browser',
  ) {
    const step =
      topic === 'account'
        ? 'account-add'
        : topic === 'login'
          ? 'account-open'
          : topic === 'switch'
            ? 'switch-stop'
            : 'proxy-nav';
    update({
      helpOpen: false,
      active: true,
      progress: { version: 1, topic, step, accountId, target },
    });
  },
  resume: () => update({ helpOpen: false, active: !!state.progress }),
  go(step: GuideStep, patch: Partial<GuideProgress> = {}) {
    if (state.progress)
      update({ progress: { ...state.progress, ...patch, step } });
  },
  proxySaved(id: string) {
    if (state.active && state.progress?.step === 'proxy-form')
      this.go('proxy-test', { proxyId: id });
  },
  accountSaved(id: string) {
    if (state.active && state.progress?.step === 'account-form')
      this.go(state.progress.topic === 'account' ? 'done' : 'account-open', {
        accountId: id,
      });
  },
  selectedAccount(id: string) {
    if (
      state.active &&
      state.progress?.step === 'switch-pick' &&
      id !== state.progress.accountId
    )
      this.go('account-open', { accountId: id });
  },
};
export function useGuide() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}
