import type { EnvironmentSettings } from './environment-settings';

export type ProxyCommand = (
  action: 'install' | 'save' | 'start' | 'stop' | 'adopt' | 'refresh',
  body?: unknown,
) => Promise<EnvironmentSettings>;

export interface ProxyConfiguration {
  source: string;
}

export interface ProxyImport {
  token: string;
  subscription_url: string;
  source: string;
  nodes: { index: number; name: string; type: string; server: string }[];
}

export const proxyTime = (value?: number) =>
  value ? new Date(value * 1000).toLocaleString() : '尚未检查';
