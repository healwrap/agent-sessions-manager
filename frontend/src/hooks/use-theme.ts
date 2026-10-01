import { useEffect } from 'react';
import type { ThemePreference } from '../lib/types';
import { applyTheme, themeStorageKey } from '../lib/theme';
import { sessionStore } from '../state/session-store';

export function useTheme(
  preference: ThemePreference,
  ready: boolean,
  saved: ThemePreference,
) {
  useEffect(() => {
    if (!ready) return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => applyTheme(preference, media.matches);
    apply();
    const change = () => {
      if (preference === 'system') apply();
    };
    media.addEventListener('change', change);
    void window.__TAURI__?.core
      ?.invoke('set_theme', { preference })
      .catch(() =>
        sessionStore.notify('原生窗口外观未能切换，页面外观已更新。'),
      );
    return () => media.removeEventListener('change', change);
  }, [preference, ready]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(themeStorageKey, saved);
    } catch {
      /* Cache is optional; settings remain canonical. */
    }
  }, [saved, ready]);
}
