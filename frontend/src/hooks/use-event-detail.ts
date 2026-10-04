import { useEffect, useState } from 'react';
import { sessionStore } from '../state/session-store';
import type { Detail } from '../lib/types';

interface LoadedDetail {
  scope: string;
  query: string;
  detail: Detail | null;
  output: Detail | null;
  error: string;
}

export function useEventDetail(
  id: string | null,
  ref: string | null,
  open: boolean,
  version: string | null,
  tab: string,
  page: number,
) {
  const part = tab === '结果' ? 'output' : tab === '原始内容' ? 'raw' : 'input';
  // A live revision refreshes the same record without removing its scrollable UI.
  const scope = JSON.stringify([id, ref]);
  const query = JSON.stringify([scope, part, page, tab === '概述']);
  const [result, setResult] = useState<LoadedDetail | null>(null);
  useEffect(() => {
    if (!open || !id || !ref) return;
    let current = true;
    void sessionStore
      .api<Detail>('/api/event', { id, ref, part, page })
      .then(async (detail) => {
        if (!current) return;
        setResult((previous) => ({
          scope,
          query,
          detail,
          output:
            detail.output_available && previous?.query === query
              ? previous.output
              : null,
          error: '',
        }));
        if (tab === '概述' && detail.output_available) {
          const output = await sessionStore.api<Detail>('/api/event', {
            id,
            ref,
            part: 'output',
            page: 1,
          });
          if (current) setResult({ scope, query, detail, output, error: '' });
        }
      })
      .catch((error) => {
        if (current)
          setResult((previous) =>
            previous?.query === query && previous.detail
              ? { ...previous, error: String(error) }
              : {
                  scope,
                  query,
                  detail: null,
                  output: null,
                  error: String(error),
                },
          );
      });
    return () => {
      current = false;
    };
  }, [id, ref, open, version, scope, query, part, page, tab]);
  const matching = result?.scope === scope ? result : null;
  return {
    detail: matching?.detail ?? null,
    output: matching?.query === query ? matching.output : null,
    error: matching?.query === query ? matching.error : '',
    loaded: matching?.query === query && matching.detail !== null,
  };
}
