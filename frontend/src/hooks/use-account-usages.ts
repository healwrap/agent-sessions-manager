import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../lib/api';
import type { AccountUsage } from '../lib/account-usage';
import type { QuotaBenchmarks, UsageOverview } from '../lib/account-overview';
import type { EnvironmentSettings } from '../lib/environment-settings';

export function useAccountUsages(settings: EnvironmentSettings, active = true) {
  const [items, setItems] = useState<Record<string, AccountUsage>>({});
  const [benchmarks, setBenchmarks] = useState<QuotaBenchmarks>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const revision = useRef(0);
  const mounted = useRef(false);
  const wake = useRef<() => void>(() => {});
  const accountIds = settings.accounts
    .filter((row) => row.provider === 'claude')
    .map((row) => row.id)
    .sort()
    .join(',');
  const readyIds = settings.browser.runs
    .filter((row) => row.alive && row.status === 'running')
    .map((row) => row.account_id)
    .sort()
    .join(',');
  const accept = useCallback((value: UsageOverview) => {
    setItems(
      Object.fromEntries(value.items.map((item) => [item.account_id, item])),
    );
    setBenchmarks(value.benchmarks);
    setNow(Date.now());
    setError('');
  }, []);
  const refresh = async (accountId: string, organization?: string) => {
    const version = ++revision.current;
    try {
      const value = await request<AccountUsage>(
        '/api/account-usage/refresh',
        {},
        {
          account_id: accountId,
          ...(organization ? { organization_id: organization } : {}),
        },
      );
      if (mounted.current && version === revision.current) {
        setItems((previous) => ({ ...previous, [accountId]: value }));
        setError('');
      }
    } catch (reason) {
      if (mounted.current) setError(String(reason));
    } finally {
      wake.current();
    }
  };
  const refreshAll = async () => {
    const version = ++revision.current;
    try {
      const value = await request<UsageOverview>(
        '/api/account-usage/refresh-all',
        {},
        {},
      );
      if (mounted.current && version === revision.current) accept(value);
    } catch (reason) {
      if (mounted.current) setError(String(reason));
    } finally {
      wake.current();
    }
  };
  const refreshBenchmarks = async () => {
    try {
      const value = await request<QuotaBenchmarks>(
        '/api/account-usage/benchmarks',
        {},
        {},
      );
      if (mounted.current) setBenchmarks(value);
    } catch (reason) {
      if (mounted.current) setError(String(reason));
    } finally {
      wake.current();
    }
  };
  useEffect(() => {
    if (!active) return;
    mounted.current = true;
    let live = true;
    const attempted = new Set<string>();
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => void poll(), delay);
    };
    wake.current = () => schedule(1000);
    const poll = async () => {
      const version = revision.current;
      let delay = 15_000;
      try {
        if (document.visibilityState === 'hidden') return;
        const value = await request<UsageOverview>(
          '/api/account-usage/overview',
        );
        if (!live || version !== revision.current) return;
        accept(value);
        setLoading(false);
        if (
          value.items.some((row) => row.refreshing) ||
          value.benchmarks.refreshing
        )
          delay = 1000;
        for (const row of value.items) {
          if (!live) return;
          const retryable = ['ready', 'error', 'rate_limited'].includes(
            row.status,
          );
          const first =
            row.status === 'idle' ||
            (readyIds.split(',').includes(row.account_id) &&
              [
                'requires_browser',
                'login_required',
                'authorization_required',
              ].includes(row.status));
          if (
            row.can_refresh &&
            ((row.stale && retryable) ||
              (first && !attempted.has(row.account_id)))
          ) {
            attempted.add(row.account_id);
            await request(
              '/api/account-usage/refresh',
              {},
              { account_id: row.account_id },
            );
            delay = 1000;
          }
        }
      } catch (reason) {
        if (live) {
          setError(String(reason));
          setLoading(false);
        }
      } finally {
        if (live) {
          setNow(Date.now());
          schedule(delay);
        }
      }
    };
    const focus = () => wake.current();
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    void poll();
    return () => {
      live = false;
      mounted.current = false;
      revision.current++;
      clearTimeout(timer);
      wake.current = () => {};
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [accountIds, readyIds, active, accept]);
  return {
    items,
    benchmarks,
    error,
    loading,
    now,
    refresh,
    refreshAll,
    refreshBenchmarks,
  };
}
export type AccountUsages = ReturnType<typeof useAccountUsages>;
