import type { EnvironmentSettings } from './environment-settings';

export type ProxyCommand = (
  action: 'install' | 'save' | 'start' | 'stop' | 'adopt' | 'refresh',
  body?: unknown,
) => Promise<EnvironmentSettings>;

export interface ProxyConfiguration {
  source: string;
  configuration: string;
}

export const proxyTime = (value?: number) =>
  value ? new Date(value * 1000).toLocaleString() : '尚未检查';
