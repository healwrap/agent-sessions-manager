import { useEffect, useRef, useState } from 'react';
import { sessionStore } from '../state/session-store';
import type { Detail } from '../lib/types';

interface LoadedDetail {
  scope: string;
  query: string;
  metadata: Detail | null;
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
  const input = useRef<{
    scope: string;
    version: string | null;
    request: Promise<Detail>;
  } | null>(null);
  useEffect(() => {
    if (!open || !id || !ref) return;
    let current = true;
    let metadataLoaded = false;
    // Tabs describe the record, not the selected payload or its current page.
    if (input.current?.scope !== scope || input.current.version !== version) {
      input.current = {
        scope,
        version,
        request: sessionStore.api<Detail>('/api/event', {
          id,
          ref,
          part: 'input',
          page: 1,
        }),
      };
    }
    const canonical = input.current;
    void canonical.request
      .then(async (metadata) => {
        metadataLoaded = true;
        if (!current) return;
        setResult((previous) =>
          previous?.scope === scope
            ? { ...previous, metadata }
            : { scope, query, metadata, detail: null, output: null, error: '' },
        );
        const detail =
          part === 'input' && page === 1
            ? metadata
            : await sessionStore.api<Detail>('/api/event', {
                id,
                ref,
                part,
                page,
              });
        if (!current) return;
        setResult((previous) => ({
          scope,
          query,
          metadata,
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
          if (current)
            setResult({ scope, query, metadata, detail, output, error: '' });
        }
      })
      .catch((error) => {
        // A failed canonical read can be retried on the next tab/open action.
        if (!metadataLoaded && input.current === canonical)
          input.current = null;
        if (current)
          setResult((previous) =>
            previous?.query === query && previous.detail
              ? { ...previous, error: String(error) }
              : {
                  scope,
                  query,
                  metadata:
                    previous?.scope === scope ? previous.metadata : null,
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
    metadata: matching?.metadata ?? null,
    detail: matching?.detail ?? null,
    output: matching?.query === query ? matching.output : null,
    error: matching?.query === query ? matching.error : '',
    loaded: matching?.query === query && matching.detail !== null,
  };
}
