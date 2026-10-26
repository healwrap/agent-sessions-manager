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
    app_profiles: [],
    proxies: [],
    accounts: [],
    apps: [],
    gate_definitions: [],
    app_runtime: { runs: [], sessions: {} },
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
  const provision = (
    item: import('../lib/environment-settings').BrowserAccount,
    route: { proxy_id: string; proxy_url?: string },
  ) => change({ collection: 'accounts', action: 'provision', item, route });
  const remove = async (collection: EnvironmentCollection, id: string) => {
    try {
      await change({ collection, action: 'delete', id });
    } catch {
      /* Workspace displays it. */
    }
  };
  const runtime = async (
    action: 'start' | 'stop' | 'open',
    body: { profile_id?: string; account_id?: string },
    target: 'browser' | 'app' = 'browser',
  ) => {
    setBusy(true);
    setError('');
    try {
      const result = await request<BrowserRuntimeState>(
        '/api/' + target + '-runtime/' + action,
        {},
        body,
      );
      setData((value) =>
        target === 'browser'
          ? { ...value, browser: result }
          : {
              ...value,
              app_runtime:
                result as import('../lib/environment-settings').AppRuntimeState,
            },
      );
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  return {
    data,
    loading,
    error,
    busy,
    reload,
    save,
    provision,
    remove,
    runtime,
  };
}
