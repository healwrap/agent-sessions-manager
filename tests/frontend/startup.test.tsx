import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from '../../frontend/src/app';
import { SessionStore } from '../../frontend/src/state/session-store';
import type { Request } from '../../frontend/src/lib/types';
import { SourceSettings } from '../../frontend/src/components/settings/sources';

describe('progressive startup', () => {
  it('pre-renders the actual application shell with loading placeholders', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Agent Sessions');
    expect(html).toContain('skeleton-bar');
    expect(html).toContain('正在加载会话');
    expect(html).not.toContain('会话 · 对话 · 轨迹');
    expect(html).toContain('value="claude:local"');
    expect(html).toContain('value="cursor:desktop"');
    expect(html).not.toContain('value="claude:desktop"');
    expect(html).not.toContain('Claude Code CLI');
    expect(html).not.toContain('Claude Code Desktop');
  });
  it('shows one Claude settings switch and retains the optional index path', () => {
    const store = new SessionStore();
    const html = renderToString(
      <SourceSettings
        draft={store.state.settings}
        data={null}
        onChange={() => {}}
      />,
    );
    expect(html.match(/role="switch"/g)).toHaveLength(6);
    expect(html).toContain('启用 Claude Code');
    expect(html).toContain('path-claude-index');
    expect(html).not.toContain('Claude Code Desktop');
    expect(html).not.toContain('Claude Code CLI');
  });
  it('starts catalogue, preferences and settings together and reuses the first catalogue response', async () => {
    const pending = new Map<string, (value: unknown) => void>();
    const calls: string[] = [];
    const store = new SessionStore(((path: string) => {
      calls.push(path);
      return new Promise((resolve) => pending.set(path, resolve));
    }) as Request);
    const boot = store.initialize();
    expect(calls).toEqual([
      '/api/sessions',
      '/api/preferences',
      '/api/settings',
    ]);
    expect(store.state.initializing).toBe(true);
    pending.get('/api/preferences')!({ saved: false, value: {} });
    pending.get('/api/settings')!({ value: store.state.settings });
    pending.get('/api/sessions')!({
      items: [],
      projects: [],
      sources: [],
      current_id: null,
    });
    await boot;
    expect(store.state.initializing).toBe(false);
    expect(store.state.catalogueLoading).toBe(false);
    expect(calls.filter((path) => path === '/api/sessions')).toHaveLength(1);
  });
});
