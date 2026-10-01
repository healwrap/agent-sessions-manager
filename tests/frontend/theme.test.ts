import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolveTheme } from '../../frontend/src/lib/theme';
import { useTheme } from '../../frontend/src/hooks/use-theme';
const effects = vi.hoisted(() => [] as Array<() => void | (() => void)>);
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (effect: () => void | (() => void)) => effects.push(effect),
}));
beforeEach(() => {
  effects.length = 0;
  vi.unstubAllGlobals();
});
it('resolves explicit themes independently from the OS', () => {
  expect(resolveTheme('system', true)).toBe('dark');
  expect(resolveTheme('system', false)).toBe('light');
  expect(resolveTheme('dark', false)).toBe('dark');
  expect(resolveTheme('light', true)).toBe('light');
});
it('follows OS changes, preserves the saved preference during preview, and removes listeners', () => {
  const root = { style: { colorScheme: '' }, dataset: {} },
    toggle = vi.fn(),
    media = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    cache = vi.fn();
  vi.stubGlobal('document', {
    documentElement: root,
    body: { toggleAttribute: toggle },
  });
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', { setItem: cache });
  vi.stubGlobal('matchMedia', () => media);
  useTheme('system', true, 'light');
  const cleanups = effects.splice(0).map((effect) => effect());
  expect(root.style.colorScheme).toBe('light');
  media.matches = true;
  media.addEventListener.mock.calls[0][1]();
  expect(toggle).toHaveBeenLastCalledWith('data-ds-dark-theme', true);
  expect(cache).toHaveBeenCalledWith('agent-sessions-theme', 'light');
  cleanups.forEach((cleanup) => cleanup?.());
  expect(media.removeEventListener).toHaveBeenCalledWith(
    'change',
    media.addEventListener.mock.calls[0][1],
  );
});
it('paints the canonical theme before hydration even when cached preference differs', () => {
  const root = {
      dataset: { themePreference: 'dark', themeCanonical: 'true' },
      style: { colorScheme: '' },
    },
    toggle = vi.fn();
  runInNewContext(
    readFileSync(
      new URL('../../frontend/public/theme-boot.js', import.meta.url),
      'utf8',
    ),
    {
      document: { documentElement: root, body: { toggleAttribute: toggle } },
      localStorage: { getItem: () => 'light' },
      matchMedia: () => ({ matches: false }),
    },
  );
  expect(root.style.colorScheme).toBe('dark');
  expect(toggle).toHaveBeenCalledWith('data-ds-dark-theme', true);
});
it('keeps boot appearance while settings are loading', () => {
  useTheme('system', false, 'system');
  expect(effects.map((effect) => effect())).toEqual([undefined, undefined]);
});
