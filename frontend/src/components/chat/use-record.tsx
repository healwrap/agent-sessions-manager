import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Detail, Event } from '../../lib/types';
import { sessionStore } from '../../state/session-store';

export const RecordSyncContext = createContext<{
  version: string | null;
  turn?: number;
}>({ version: null });

type RecordContent = 'all' | 'thinking' | 'output';

function lastPage(detail: Detail, content: RecordContent) {
  if (content === 'thinking') return detail.thinking_pages ?? detail.pages;
  if (content === 'output' && detail.output_page === null) return 0;
  return detail.pages;
}

function appendPage(detail: Detail, next: Detail): Detail {
  return {
    ...detail,
    page: next.page,
    pages: next.pages,
    thinking_pages: next.thinking_pages,
    inline_images: [
      ...(detail.inline_images || []),
      ...(next.inline_images || []),
    ],
    text: detail.text + next.text,
    thinking_text:
      detail.thinking_text == null
        ? undefined
        : detail.thinking_text + (next.thinking_text || ''),
    output_text:
      detail.output_text == null
        ? undefined
        : detail.output_text + (next.output_text || ''),
  };
}

export function useRecord(
  id: string,
  event: Event,
  revision?: string | number | null,
  enabled = true,
  part?: string,
  content: RecordContent = 'all',
) {
  const ref = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const loadedPages = useRef(1);
  const sync = useContext(RecordSyncContext);
  const contentVersion = JSON.stringify([
    revision,
    event.status,
    event.turn_status,
    event.preview,
    event.output_preview,
    event.output_chars,
    sync.turn === event.turn ? sync.version : null,
  ]);
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
              content === 'output' &&
              value.output_text === '' &&
              value.output_page &&
              value.output_page > 1
            )
              value = await sessionStore.api<Detail>('/api/event', {
                id,
                ref: event.ref,
                page: value.output_page,
              });
            for (
              let i = 1;
              i < loadedPages.current && value.page < lastPage(value, content);
              i++
            ) {
              if (token !== generation.current) return;
              const next = await sessionStore.api<Detail>('/api/event', {
                id,
                ref: event.ref,
                page: value.page + 1,
                ...(part ? { part } : {}),
              });
              value = appendPage(value, next);
            }
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
  }, [id, event.ref, contentVersion, enabled, part, content]);
  const loadMore = async () => {
    if (!detail || busy || detail.page >= lastPage(detail, content)) return;
    const token = generation.current;
    setBusy(true);
    try {
      const next = await sessionStore.api<Detail>('/api/event', {
        id,
        ref: event.ref,
        page: detail.page + 1,
        ...(part ? { part } : {}),
      });
      if (token === generation.current) {
        loadedPages.current++;
        setDetail(appendPage(detail, next));
      }
    } catch (failure) {
      if (token === generation.current) setError(String(failure));
    } finally {
      if (token === generation.current) setBusy(false);
    }
  };
  return {
    ref,
    detail,
    busy,
    error,
    loadMore,
    pages: detail ? lastPage(detail, content) : 0,
  };
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
      {record.detail && record.detail.page < record.pages && (
        <button
          className="chat-expand"
          disabled={record.busy}
          onClick={() => void record.loadMore()}
        >
          {record.busy
            ? '正在读取…'
            : `继续展开（${record.detail.page} / ${record.pages} 页）`}
        </button>
      )}
    </>
  );
}
