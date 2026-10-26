import { useCallback, useEffect, useState } from 'react';
import { request } from '../lib/api';
import type {
  BrowserProfile,
  EnvironmentSettings,
  ProxyConfig,
} from '../lib/environment-settings';

export function useEnvironmentSettings() {
  const [data, setData] = useState<EnvironmentSettings>({
    profiles: [],
    proxies: [],
    apps: [],
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
    void reload();
  }, [reload]);
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
  const save = (
    collection: 'profiles' | 'proxies',
    item: BrowserProfile | ProxyConfig,
  ) => change({ collection, action: 'save', item });
  const remove = async (collection: 'profiles' | 'proxies', id: string) => {
    try {
      await change({ collection, action: 'delete', id });
    } catch {
      /* Displayed in the workspace. */
    }
  };
  return { data, loading, error, busy, reload, save, remove };
}
