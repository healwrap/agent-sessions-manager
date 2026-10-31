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
  state: 'pass' | 'fail' | 'unknown' | 'skip' | 'info';
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
  route?: {
    root_id: string;
    proxy_id: string;
    root_name: string;
    proxy_name: string;
    clash_node: string;
    backup: boolean;
    attempts: string[];
  };
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
  session_sync?: {
    state: 'complete' | 'partial' | 'pending';
    imported: number;
    updated: number;
    unchanged: number;
    branches: number;
    skipped: number;
    completed_at: string;
    message: string;
    issues: { title: string; path: string; reason: string }[];
  };
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
  fallback_ids?: string[];
  fallback_mode?: 'manual' | 'automatic';
  node?: {
    name: string;
    type: string;
    server: string;
    port: number;
    [key: string]: unknown;
  };
  id: string;
  name: string;
  url: string;
  kind: 'clash';
  clash_node: string;
}
export interface LocalApp {
  id: string;
  name: string;
  path: string;
}
export interface EnvironmentSettings {
  network?: ClashNetwork;
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
}
export interface ClashNetwork {
  fallbacks?: {
    id: string;
    current_id: string;
    chain: string[];
    switching: boolean;
    state?: 'healthy' | 'backup' | 'degraded' | 'exhausted' | 'switching';
    failures?: number;
    message?: string;
    checked_at?: string;
    switched_at?: string;
  }[];
  connected: boolean;
  version: string;
  tun: boolean;
  mode: string;
  error: string;
  endpoint: string;
  secret_set: boolean;
  controller?: string;
  group: string;
  current_node: string;
  nodes: { name: string; type: string }[];
  routing_ready: boolean;
  domains: string[];
  dns: string[];
  auto_prepare?: boolean;
  routing_active?: boolean;
  restore_error?: string;
  secret_source?: 'auto' | 'manual' | 'none';
  profile?: { name: string; type: string; dynamic_providers: number };
  system_proxy?: {
    supported: boolean;
    enabled: boolean | null;
    clash_configured?: boolean;
    error: string;
  };
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
