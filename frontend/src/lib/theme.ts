import type { ThemePreference } from './types';
export const themeStorageKey = 'agent-sessions-theme';
export const resolveTheme = (
  preference: ThemePreference,
  systemDark: boolean,
) => (preference === 'system' ? (systemDark ? 'dark' : 'light') : preference);

export function applyTheme(preference: ThemePreference, systemDark: boolean) {
  const resolved = resolveTheme(preference, systemDark);
  document.body.toggleAttribute('data-ds-dark-theme', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
  document.documentElement.dataset.themePreference = preference;
}
