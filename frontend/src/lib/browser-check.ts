import {
  inspectDiagnosticWindow,
  type DiagnosticItem,
} from './claude-diagnostics';
import type { GateResult } from './environment-settings';
import { countryLabel, nodeLabel } from './diagnostic-labels';
import { browserDns } from './browser-dns';
import { browserStorage } from './browser-storage';

export interface BrowserCheckTicket {
  token: string;
  launch?: {
    state: 'checking' | 'allowed' | 'blocked' | 'failed';
    checks?: GateResult[];
    next_url?: string;
    error?: string;
  };
  probe_options?: {
    managed?: boolean;
    exit_source?: string;
    exit?: boolean;
    fingerprint?: boolean;
    webrtc?: boolean;
    dns?: boolean;
  };
  url?: string;
  name: string;
  expected: { locale?: string; timezone?: string };
  state: 'waiting' | 'complete' | 'failed';
  error?: string;
  report?: { checked_at: string; checks: DiagnosticItem[] } | null;
}

async function browserExit(claude: boolean): Promise<DiagnosticItem> {
  const title = claude
    ? '浏览器 Claude 域名出口'
    : '浏览器 Cloudflare 域名出口';
  const base = {
    id: claude ? 'browser-http-ip' : 'browser-cloudflare-ip',
    title,
    scope: '独立浏览器检测页',
  };
  const url = claude
    ? 'https://claude.ai/cdn-cgi/trace'
    : 'https://www.cloudflare.com/cdn-cgi/trace';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = Object.fromEntries(
      (await response.text())
        .trim()
        .split('\n')
        .map((line) => line.split('=')),
    );
    if (!data.ip || !/^[\da-f:.]+$/i.test(data.ip))
      throw new Error('未取得有效 IP');
    const location = [
      countryLabel(data.loc),
      data.colo ? nodeLabel(data.colo) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      ...base,
      state: 'info',
      value: data.ip,
      detail: `${location}；由此浏览器直接访问 ${new URL(url).hostname} 测得，使用此环境自己的代理与路由。`,
    };
  } catch (reason) {
    return {
      ...base,
      state: 'unknown',
      value: controller.signal.aborted
        ? '浏览器出口查询超时'
        : '浏览器出口查询未完成',
      detail: `${new URL(url).hostname}：${controller.signal.aborted ? '10 秒内未完成响应' : String(reason)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function managedExit(source = ''): Promise<DiagnosticItem> {
  const base = {
    id: 'browser-http-ip',
    title: '浏览器 HTTP 出口',
    scope: '独立浏览器检测页',
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const url =
      source === 'https://api.ipify.org?format=json'
        ? source
        : 'https://www.cloudflare.com/cdn-cgi/trace';
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value: { ip?: string } = url.includes('ipify')
      ? await response.json()
      : Object.fromEntries(
          (await response.text())
            .trim()
            .split('\n')
            .map((line) => line.split('=')),
        );
    if (!value.ip || !/^[\da-f:.]+$/i.test(value.ip))
      throw new Error('未取得有效 IP');
    return {
      ...base,
      state: 'info',
      value: value.ip,
      detail: `由目标浏览器经环境专用代理访问 ${new URL(url).hostname} 测得，与预检使用同一探针。`,
    };
  } catch (reason) {
    return {
      ...base,
      state: 'unknown',
      value: '未取得浏览器出口',
      detail: String(reason),
    };
  } finally {
    clearTimeout(timer);
  }
}
export async function inspectTargetBrowser(
  options: BrowserCheckTicket['probe_options'] = {},
): Promise<DiagnosticItem[]> {
  const skipped = (id: string, title: string): DiagnosticItem => ({
    id,
    title,
    state: 'unknown',
    value: '本次未执行',
    detail: '启动门控按配置跳过此探针。',
    scope: '独立浏览器检测页',
  });
  const [checks, claude, cloudflare, dns] = await Promise.all([
    inspectDiagnosticWindow(options),
    options.managed
      ? options.exit === false
        ? skipped('browser-http-ip', '浏览器 HTTP 出口')
        : managedExit(options.exit_source)
      : browserExit(true),
    options.managed
      ? skipped('browser-cloudflare-ip', '浏览器 Cloudflare 域名出口')
      : browserExit(false),
    browserDns(options.dns !== false),
  ]);
  return [claude, cloudflare, ...checks, dns, browserStorage()];
}
