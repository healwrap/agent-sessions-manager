import type { Request } from './types';
import { isGuideDemo } from './demo-mode';
export const request: Request = async <T>(
  path: string,
  params = {},
  body?: unknown,
): Promise<T> => {
  if (isGuideDemo) {
    const { demoRequest } = await import('../demo/request');
    return demoRequest<T>(path, params, body);
  }
  const query = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    ['/api/claude-diagnostics/run', '/api/browser-runtime/region'].includes(
      path,
    )
      ? 60_000
      : 30_000,
  );
  try {
    const response = await fetch(
      path + (query ? '?' + query : ''),
      body === undefined
        ? { signal: controller.signal }
        : {
            signal: controller.signal,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '读取失败');
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('读取超时，请重试。');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};
export async function copyText(text: string) {
  if (isGuideDemo) throw new Error('演示模式不会修改剪贴板。');
  if (window.__TAURI__?.clipboardManager)
    await window.__TAURI__.clipboardManager.writeText(text);
  else await navigator.clipboard.writeText(text);
}
