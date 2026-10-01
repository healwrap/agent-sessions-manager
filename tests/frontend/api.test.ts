import { it, expect, vi, afterEach } from 'vitest';
import { request } from '../../frontend/src/lib/api';
afterEach(() => vi.unstubAllGlobals());
it('writes settings to the exact POST route and retains values', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ saved: true }) });
  vi.stubGlobal('fetch', fetch);
  await request(
    '/api/preferences',
    {},
    { aliases: { original: 'token=original' } },
  );
  expect(fetch.mock.calls[0][0]).toBe('/api/preferences');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    aliases: { original: 'token=original' },
  });
});
it('encodes qualified source IDs in reads', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', fetch);
  await request('/api/sessions', { provider: 'antigravity:cli' });
  expect(fetch.mock.calls[0][0]).toBe(
    '/api/sessions?provider=antigravity%3Acli',
  );
});
