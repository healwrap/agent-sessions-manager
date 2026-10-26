export interface BrowserProfile {
  id: string;
  name: string;
  provider: 'claude' | 'codex';
  engine: 'ccbaga' | 'chrome';
  proxy_id: string;
  locale: string;
  timezone: string;
  fingerprint_seed: string;
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
  proxies: ProxyConfig[];
  apps: LocalApp[];
}
export type EnvironmentSection =
  'browser' | 'claude-app' | 'proxies' | 'diagnostics';
