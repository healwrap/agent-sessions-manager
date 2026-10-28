import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [pollError, setPollError] = useState('');
  const revision = useRef(0);
  const pending = useRef(false);
  const begin = () => {
    revision.current++;
    pending.current = true;
    setBusy(true);
    setError('');
  };
  const finish = () => {
    revision.current++;
    pending.current = false;
    setBusy(false);
  };
  const reload = useCallback(async () => {
    const version = revision.current;
    setLoading(true);
    setError('');
    try {
      const latest = await request<EnvironmentSettings>('/api/environments');
      if (version === revision.current && !pending.current) setData(latest);
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
      const version = revision.current;
      try {
        if (!pending.current) {
          const latest =
            await request<EnvironmentSettings>('/api/environments');
          if (current && version === revision.current && !pending.current) {
            setData(latest);
            setPollError('');
          }
        }
      } catch (reason) {
        if (current && !pending.current)
          setPollError('运行状态更新失败：' + String(reason));
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
    begin();
    try {
      setData(
        await request<EnvironmentSettings>('/api/environments', {}, body),
      );
    } catch (reason) {
      setError(String(reason));
      throw reason;
    } finally {
      finish();
    }
  };
  const save = (collection: EnvironmentCollection, item: EnvironmentItem) =>
    change({ collection, action: 'save', item });
  const proxyCommand = async (
    action: 'install' | 'save' | 'start' | 'stop' | 'adopt',
    body: unknown = {},
  ) => {
    begin();
    try {
      const latest = await request<EnvironmentSettings>(
        '/api/proxy-services/' + action,
        {},
        body,
      );
      setData(latest);
      return latest;
    } catch (reason) {
      setError(String(reason));
      throw reason;
    } finally {
      finish();
    }
  };
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
    begin();
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
      finish();
    }
  };
  const installKernel = async (action: 'check' | 'install') => {
    begin();
    try {
      const installation = await request<
        BrowserRuntimeState['kernel']['installation']
      >('/api/browser-kernel/install', {}, { action });
      setData((value) => ({
        ...value,
        browser: {
          ...value.browser,
          kernel: { ...value.browser.kernel, installation },
        },
      }));
    } catch (reason) {
      setError(String(reason));
    } finally {
      finish();
    }
  };
  return {
    data,
    loading,
    error: error || pollError,
    busy,
    reload,
    save,
    provision,
    remove,
    runtime,
    installKernel,
    proxyCommand,
  };
}
