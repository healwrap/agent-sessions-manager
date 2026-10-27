import type { DiagnosticItem } from './claude-diagnostics';
export type GateMode = 'block' | 'warn' | 'off';
export interface GateDefinition {
  id: string;
  title: string;
  description: string;
  default_mode: GateMode;
}
export interface GateResult {
  id: string;
  title: string;
  policy: GateMode;
  state: 'pass' | 'fail' | 'unknown' | 'skip';
  value: string;
  detail: string;
}
export interface ProfileRoute {
  id: string;
  name: string;
  proxy_id: string;
  locale: string;
  timezone: string;
  locale_mode?: 'manual' | 'proxy';
  timezone_mode?: 'manual' | 'proxy';
  expected_ip?: string;
  expected_dns?: string;
  gates?: Record<string, GateMode>;
}
export interface BrowserProfile extends ProfileRoute {
  provider: 'claude' | 'codex';
  engine: 'fingerprint-chromium' | 'ccbaga' | 'chrome';
  fingerprint_seed: string;
}
export interface AppProfile extends ProfileRoute {}
export interface BrowserAccount {
  id: string;
  name: string;
  provider: 'claude' | 'codex';
  profile_id: string;
  app_profile_id?: string;
}
export interface BrowserRun {
  profile_id: string;
  account_id: string;
  name: string;
  status:
    'checking' | 'running' | 'blocked' | 'failed' | 'stopped' | 'interrupted';
  alive: boolean;
  stage: string;
  checked_at: string;
  checks: GateResult[];
  resolved: {
    ip?: string;
    country?: string;
    locale?: string;
    timezone?: string;
  };
  browser_checks: DiagnosticItem[];
  error: string;
  engine?: string;
  pid?: number;
  data_directory?: string;
  pages?: { title: string; url: string }[];
}
export interface LocalSession {
  state: 'saved' | 'empty' | 'unavailable';
  label: string;
}
export interface AppRuntimeState {
  warnings?: string[];
  runs: BrowserRun[];
  sessions: Record<string, LocalSession>;
}
export interface BrowserRuntimeState {
  kernel: {
    available: boolean;
    name: string;
    version: string;
    path: string;
    source: string;
    installation?: {
      state: 'idle' | 'installing' | 'ready' | 'failed';
      progress: number;
      message: string;
      error: string;
    };
  };
  runs: BrowserRun[];
  sessions?: Record<string, LocalSession>;
}
export interface ProxyConfig {
  id: string;
  name: string;
  url: string;
}
export interface LocalApp {
  id: string;
  name: string;
  path: string;
}
export interface EnvironmentSettings {
  profiles: BrowserProfile[];
  app_profiles: AppProfile[];
  proxies: ProxyConfig[];
  accounts: BrowserAccount[];
  apps: LocalApp[];
  gate_definitions: GateDefinition[];
  browser: BrowserRuntimeState;
  app_runtime: AppRuntimeState;
}
export type EnvironmentSection =
  'accounts' | 'browser' | 'claude-app' | 'proxies' | 'diagnostics';
export type EnvironmentCollection =
  'profiles' | 'app_profiles' | 'proxies' | 'accounts';
export type EnvironmentItem =
  BrowserProfile | AppProfile | ProxyConfig | BrowserAccount;
export function browserAvailable(
  data: EnvironmentSettings,
  profile?: BrowserProfile,
) {
  return profile?.engine === 'chrome'
    ? data.apps.some((app) => app.id === 'chrome')
    : data.browser.kernel.available;
}
export const runLabels: Record<BrowserRun['status'], string> = {
  checking: '启动检查中',
  running: '运行中',
  blocked: '已拦截',
  failed: '启动失败',
  stopped: '已停止',
  interrupted: '待恢复',
};
