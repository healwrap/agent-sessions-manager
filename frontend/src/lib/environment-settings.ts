import type { DiagnosticItem } from './claude-diagnostics';
import type { DnsServer } from './leak-observation';
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
  label?: string;
  resolvers?: DnsServer[];
}
export interface ProfileRoute {
  id: string;
  name: string;
  name_account_id?: string;
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
  // Retain the legacy Chrome value for displaying unsupported saved profiles.
  engine: 'fingerprint-chromium' | 'ccbaga' | 'chrome';
  fingerprint_seed: string;
}
export interface AppProfile extends ProfileRoute {
  inherit_skills?: boolean;
  inherit_plugins?: boolean;
}
export interface BrowserAccount {
  id: string;
  name: string;
  provider: 'claude' | 'codex';
  profile_id: string;
  app_profile_id?: string;
  usage_plan?: '' | 'pro' | 'max5' | 'max20';
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
      state:
        | 'idle'
        | 'checking'
        | 'installing'
        | 'ready'
        | 'update_available'
        | 'failed';
      version?: string;
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
  kind?: 'external' | 'managed';
}
export interface ProxySubscription {
  url: string;
  node_name: string;
  interval_hours: number;
  last_checked?: number;
  last_updated?: number;
  error?: string;
  status: 'updating' | 'error' | 'pending' | 'current';
}
export interface ManagedProxy {
  id: string;
  alive: boolean;
  pid?: number;
  status: 'running' | 'stopped' | 'failed';
  error: string;
  node?: { name: string; type: string };
  direct_domains: string[];
  subscription?: ProxySubscription | null;
}
export interface ProxyRuntimeState {
  core: {
    available: boolean;
    version: string;
    installation: {
      state: string;
      progress: number;
      error: string;
      message: string;
    };
  };
  entries: ManagedProxy[];
  adoptable: string[];
}
export interface LocalApp {
  id: string;
  name: string;
  path: string;
}
export interface EnvironmentSettings {
  profile_owners?: Record<
    'profiles' | 'app_profiles',
    Record<string, { account_id: string; account_name: string }>
  >;
  profiles: BrowserProfile[];
  app_profiles: AppProfile[];
  proxies: ProxyConfig[];
  accounts: BrowserAccount[];
  apps: LocalApp[];
  gate_definitions: GateDefinition[];
  browser: BrowserRuntimeState;
  app_runtime: AppRuntimeState;
  proxy_runtime?: ProxyRuntimeState;
}
export type EnvironmentSection =
  'accounts' | 'browser' | 'claude-app' | 'proxies';
export type EnvironmentCollection =
  'profiles' | 'app_profiles' | 'proxies' | 'accounts';
export type EnvironmentItem =
  BrowserProfile | AppProfile | ProxyConfig | BrowserAccount;
export function browserAvailable(
  data: EnvironmentSettings,
  profile?: BrowserProfile,
) {
  return profile?.engine !== 'chrome' && data.browser.kernel.available;
}
export const runLabels: Record<BrowserRun['status'], string> = {
  checking: '启动检查中',
  running: '运行中',
  blocked: '已拦截',
  failed: '启动失败',
  stopped: '已停止',
  interrupted: '待恢复',
};
