import type { Request } from './types';
export const request: Request = async <T>(
  path: string,
  params = {},
  body?: unknown,
): Promise<T> => {
  const query = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
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
  if (window.__TAURI__?.clipboardManager)
    await window.__TAURI__.clipboardManager.writeText(text);
  else await navigator.clipboard.writeText(text);
}
export async function showAbout() {
  if (window.__TAURI__?.core) {
    const fallback = await window.__TAURI__.core.invoke<string | null>(
      'show_about',
    );
    if (fallback) window.alert(fallback);
  } else {
    window.alert(
      'Agent Sessions\n\n管理本地 Agent 会话、对话与轨迹。\n支持 Codex、Claude Code、Cursor、Antigravity Desktop / CLI 和 DeepSeek Harness。',
    );
  }
}
