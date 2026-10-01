import type { Request } from './types';
export const request: Request = async <T>(
  path: string,
  params = {},
  body?: unknown,
): Promise<T> => {
  const query = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const response = await fetch(
    path + (query ? '?' + query : ''),
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '读取失败');
  return data;
};
export async function copyText(text: string) {
  if (window.__TAURI__?.clipboardManager)
    await window.__TAURI__.clipboardManager.writeText(text);
  else await navigator.clipboard.writeText(text);
}
