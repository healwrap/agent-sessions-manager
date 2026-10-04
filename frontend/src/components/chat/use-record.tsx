import { useEffect, useRef, useState } from 'react';
import type { Detail, Event } from '../../lib/types';
import { sessionStore } from '../../state/session-store';

export function useRecord(
  id: string,
  event: Event,
  revision?: string | number | null,
  enabled = true,
  part?: string,
  preferOutput = false,
) {
  const ref = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current;
    if (!enabled) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setBusy(true);
        void sessionStore
          .api<Detail>('/api/event', {
            id,
            ref: event.ref,
            ...(part ? { part } : {}),
          })
          .then(async (value) => {
            if (
              preferOutput &&
              value.output_text === '' &&
              value.output_page &&
              value.output_page > 1
            )
              value = await sessionStore.api<Detail>('/api/event', {
                id,
                ref: event.ref,
                page: value.output_page,
              });
            if (token === generation.current) {
              setDetail(value);
              setError('');
            }
          })
          .catch((failure) => {
            if (token === generation.current) setError(String(failure));
          })
          .finally(() => {
            if (token === generation.current) setBusy(false);
          });
      },
      { rootMargin: '400px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      generation.current++;
      observer.disconnect();
    };
  }, [id, event.ref, revision, enabled, part, preferOutput]);
  const loadMore = async () => {
    if (!detail || busy || detail.page >= detail.pages) return;
    const token = generation.current;
    setBusy(true);
    try {
      const next = await sessionStore.api<Detail>('/api/event', {
        id,
        ref: event.ref,
        page: detail.page + 1,
        ...(part ? { part } : {}),
      });
      if (token === generation.current)
        setDetail({
          ...detail,
          page: next.page,
          pages: next.pages,
          text: detail.text + next.text,
          thinking_text:
            detail.thinking_text == null
              ? undefined
              : detail.thinking_text + (next.thinking_text || ''),
          output_text:
            detail.output_text == null
              ? undefined
              : detail.output_text + (next.output_text || ''),
        });
    } catch (failure) {
      if (token === generation.current) setError(String(failure));
    } finally {
      if (token === generation.current) setBusy(false);
    }
  };
  return { ref, detail, busy, error, loadMore };
}

export function RecordPages({
  record,
}: {
  record: ReturnType<typeof useRecord>;
}) {
  return (
    <>
      {record.error && (
        <p className="metadata-note" role="status">
          {record.error}
        </p>
      )}
      {record.detail && record.detail.page < record.detail.pages && (
        <button
          className="chat-expand"
          disabled={record.busy}
          onClick={() => void record.loadMore()}
        >
          {record.busy
            ? '正在读取…'
            : `继续展开（${record.detail.page} / ${record.detail.pages} 页）`}
        </button>
      )}
    </>
  );
}
