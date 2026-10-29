import { useEffect, useRef, useState } from 'react';
import { request } from '../lib/api';
import type { AccountUsage } from '../lib/account-usage';

export function useAccountUsage(accountId: string, browserReady: boolean) {
  const [data, setData] = useState<AccountUsage>();
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const revision = useRef(0);
  const mounted = useRef(false);
  const wake = useRef<(() => void) | undefined>(undefined);
  const refresh = async (organization?: string) => {
    const version = ++revision.current;
    setError('');
    try {
      const latest = await request<AccountUsage>(
        '/api/account-usage/refresh',
        {},
        {
          account_id: accountId,
          ...(organization ? { organization_id: organization } : {}),
        },
      );
      if (mounted.current && version === revision.current) setData(latest);
    } catch (reason) {
      if (mounted.current && version === revision.current)
        setError(String(reason));
    } finally {
      if (mounted.current) wake.current?.();
    }
  };
  useEffect(() => {
    mounted.current = true;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => void poll(), delay);
    };
    wake.current = () => schedule(1000);
    const poll = async (initial = false) => {
      const version = revision.current;
      let delay = 15_000;
      try {
        const latest = await request<AccountUsage>('/api/account-usage', {
          account_id: accountId,
        });
        if (!active || version !== revision.current) return;
        setData(latest);
        setError('');
        const retryable = ['ready', 'error', 'rate_limited'].includes(
          latest.status,
        );
        const first =
          initial &&
          (latest.status === 'idle' ||
            (browserReady &&
              ['requires_browser', 'login_required'].includes(latest.status)));
        if (latest.can_refresh && ((latest.stale && retryable) || first)) {
          await refresh();
          delay = 1000;
        } else if (latest.refreshing) delay = 1000;
      } catch (reason) {
        if (active) setError(String(reason));
      } finally {
        if (active) {
          setNow(Date.now());
          schedule(version === revision.current ? delay : 1000);
        }
      }
    };
    void poll(true);
    return () => {
      active = false;
      mounted.current = false;
      wake.current = undefined;
      clearTimeout(timer);
      revision.current++;
    };
  }, [accountId, browserReady]);
  return { data, error, now, refresh };
}
