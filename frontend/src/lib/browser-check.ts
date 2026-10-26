import {
  inspectDiagnosticWindow,
  type DiagnosticItem,
} from './claude-diagnostics';
import { countryLabel, nodeLabel } from './diagnostic-labels';

export interface BrowserCheckTicket {
  token: string;
  url?: string;
  name: string;
  expected: { locale?: string; timezone?: string };
  state: 'waiting' | 'complete';
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

export async function inspectTargetBrowser(): Promise<DiagnosticItem[]> {
  const [checks, claude, cloudflare] = await Promise.all([
    inspectDiagnosticWindow(),
    browserExit(true),
    browserExit(false),
  ]);
  return [claude, cloudflare, ...checks];
}
