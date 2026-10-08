import { useEffect, useState } from 'react';
import { request } from '../lib/api';
import type { SessionFamily } from '../lib/types';

export function useSessionFamily(
  id: string,
  seconds: number,
  running: boolean,
  activity: boolean,
) {
  const [family, setFamily] = useState<SessionFamily | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(30);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let live = running;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      if (cancelled) return;
      if (document.hidden) {
        timer = setTimeout(() => void refresh(), 5000);
        return;
      }
      try {
        const first = await request<SessionFamily>('/api/session-family', {
          id,
          limit: Math.min(100, visible),
          activity: activity ? 1 : 0,
        });
        let next = first.next_offset;
        let items = first.items;
        while (!cancelled && next !== null && items.length < visible) {
          const page = await request<SessionFamily>('/api/session-family', {
            id,
            offset: next,
            limit: Math.min(100, visible - items.length),
            activity: activity ? 1 : 0,
          });
          items = [...items, ...page.items];
          if (page.next_offset === next) break;
          next = page.next_offset;
        }
        if (!cancelled) {
          live =
            running ||
            items.some((item) =>
              ['in_progress', 'running'].includes(item.status),
            );
          setFamily({ ...first, items, next_offset: next });
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(
            () => void refresh(),
            live ? 2000 : Math.max(5, seconds) * 1000,
          );
        }
      }
    };
    setLoading(true);
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, seconds, running, activity, visible, retry]);
  return {
    family,
    loading,
    error,
    loadMore: () => setVisible((count) => count + 30),
    retry: () => setRetry((count) => count + 1),
  };
}
