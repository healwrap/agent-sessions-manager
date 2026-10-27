import type { DiagnosticItem } from './claude-diagnostics';
import { countryLabel } from './diagnostic-labels';

export async function browserDns(enabled = true): Promise<DiagnosticItem> {
  const base = {
    id: 'dns',
    title: 'DNS 解析器出口',
    scope: '独立浏览器检测页',
  };
  if (!enabled)
    return {
      ...base,
      state: 'unknown',
      value: '本次未执行',
      detail: '启动门控按配置跳过 DNS 探针。',
    };
  const servers = new Map<string, string[]>();
  const errors: string[] = [];
  await Promise.all(
    ['dns4', 'dns6'].flatMap((family) =>
      ['org', 'net'].map(async (domain) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        const host = `${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}.${family}.browserleaks.${domain}`;
        try {
          const response = await fetch(`https://${host}`, {
            credentials: 'omit',
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data: Record<string, unknown> = await response.json();
          if (typeof data.error === 'string') throw new Error(data.error);
          for (const [ip, info] of Object.entries(data))
            if (
              /^[\da-f:.]+$/i.test(ip) &&
              Array.isArray(info) &&
              info.every((value) => typeof value === 'string')
            )
              servers.set(ip, info);
        } catch (reason) {
          errors.push(
            controller.signal.aborted ? `${family} 查询超时` : String(reason),
          );
        } finally {
          clearTimeout(timeout);
        }
      }),
    ),
  );
  return {
    ...base,
    state: servers.size ? 'info' : 'unknown',
    value: servers.size ? [...servers.keys()].join('、') : '未取得 DNS 解析器',
    detail: servers.size
      ? [...servers]
          .map(
            ([ip, info]) =>
              `${ip} · ${countryLabel(info[0])} · ${info.slice(1).join(' · ')}`,
          )
          .join('；') +
        '。来自此浏览器访问随机 IPv4 / IPv6 域名后的 BrowserLeaks 权威观测；DNS 解析器地址通常与网页出口不同，需与预期 DNS 列表比较。'
      : `BrowserLeaks 权威探针未完成：${[...new Set(errors)].join('；')}。`,
  };
}
