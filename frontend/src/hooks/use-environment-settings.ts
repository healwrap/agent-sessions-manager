import { useCallback, useEffect, useState } from 'react';
import { request } from '../lib/api';
import type {
  BrowserRuntimeState,
  EnvironmentCollection,
  EnvironmentItem,
  EnvironmentSettings,
} from '../lib/environment-settings';

export function useEnvironmentSettings(active = true, watchRuntime = true) {
  const [data, setData] = useState<EnvironmentSettings>({
    profiles: [],
    proxies: [],
    accounts: [],
    apps: [],
    gate_definitions: [],
    browser: {
      kernel: {
        available: false,
        name: 'Fingerprint Chromium',
        version: '',
        path: '',
        source: '',
      },
      runs: [],
    },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await request<EnvironmentSettings>('/api/environments'));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (active) void reload();
  }, [active, reload]);
  useEffect(() => {
    if (!active || !watchRuntime) return;
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const latest = await request<EnvironmentSettings>('/api/environments');
        if (current) setData(latest);
      } catch {
        /* Explicit actions display request errors. */
      }
      if (current) timer = setTimeout(() => void poll(), 1500);
    };
    void poll();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [active, watchRuntime]);
  const change = async (body: unknown) => {
    setBusy(true);
    setError('');
    try {
      setData(
        await request<EnvironmentSettings>('/api/environments', {}, body),
      );
    } catch (reason) {
      setError(String(reason));
      throw reason;
    } finally {
      setBusy(false);
    }
  };
  const save = (collection: EnvironmentCollection, item: EnvironmentItem) =>
    change({ collection, action: 'save', item });
  const remove = async (collection: EnvironmentCollection, id: string) => {
    try {
      await change({ collection, action: 'delete', id });
    } catch {
      /* Workspace displays it. */
    }
  };
  const runtime = async (
    action: 'start' | 'stop',
    body: { profile_id?: string; account_id?: string },
  ) => {
    setBusy(true);
    setError('');
    try {
      const browser = await request<BrowserRuntimeState>(
        '/api/browser-runtime/' + action,
        {},
        body,
      );
      setData((value) => ({ ...value, browser }));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  return { data, loading, error, busy, reload, save, remove, runtime };
}
