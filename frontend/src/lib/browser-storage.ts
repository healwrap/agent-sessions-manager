import type { DiagnosticItem } from './claude-diagnostics';

export function browserStorage(): DiagnosticItem {
  const base = {
    id: 'profile-storage',
    title: 'Profile 存储标记',
    scope: '独立浏览器检测页',
  };
  try {
    const key = 'agent-sessions-profile-marker';
    const previous = localStorage.getItem(key);
    const marker = previous || crypto.randomUUID();
    localStorage.setItem(key, marker);
    document.cookie = `${key}=${marker}; Max-Age=31536000; Path=/; SameSite=Strict`;
    const cookie = document.cookie
      .split('; ')
      .find((item) => item.startsWith(key + '='))
      ?.slice(key.length + 1);
    const saved = localStorage.getItem(key) === marker && cookie === marker;
    return {
      ...base,
      state: saved ? 'pass' : 'warn',
      value: marker,
      detail: saved
        ? `${previous ? '读取到上次保存的标记' : '首次生成并保存标记'}；Cookie 与 Local Storage 可读写。仅用于本机检测页，比较不同 Profile 及关闭重开后的存储状态。`
        : '此浏览器未能同时保存 Cookie 与 Local Storage，请检查站点存储设置。',
    };
  } catch (error) {
    return {
      ...base,
      state: 'unknown',
      value: '未完成存储检查',
      detail: String(error),
    };
  }
}
