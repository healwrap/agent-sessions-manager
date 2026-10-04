import { useLayoutEffect, useRef, type RefObject } from 'react';
import { sessionStore, type View } from '../state/session-store';

/** Fill space exposed by folding without requiring a wheel or scroll event. */
export function useHistoryAutofill(
  ref: RefObject<HTMLElement | null>,
  view: View,
  mode: 'trace' | 'chat',
  active: boolean,
  id: string | null,
) {
  const attempted = useRef('');
  useLayoutEffect(() => {
    attempted.current = '';
  }, [active, id, mode, view.query]);
  useLayoutEffect(() => {
    const pane = ref.current;
    if (view.version === null) attempted.current = '';
    if (!pane || !active || view.loading || view.next === null) return;
    const footer = pane.querySelector('[data-history-load="after"]');
    if (!footer) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const state = sessionStore.state,
          latest = state.views[mode];
        if (
          !entries.some((entry) => entry.isIntersecting) ||
          !pane.clientHeight ||
          state.id !== id ||
          state.mode !== mode ||
          latest.loading ||
          latest.next !== view.next ||
          latest.query !== view.query ||
          latest.version !== view.version
        )
          return;
        const cursor = JSON.stringify([
          id,
          mode,
          latest.query,
          latest.version,
          latest.next,
        ]);
        // A failed page keeps its manual retry; do not repeatedly request it.
        if (attempted.current === cursor) return;
        attempted.current = cursor;
        void sessionStore.loadTrace(false, 'after');
      },
      { root: pane },
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, [
    active,
    id,
    mode,
    ref,
    view.loading,
    view.next,
    view.query,
    view.version,
  ]);
}
