import { useLayoutEffect, useRef, type RefObject } from 'react';
import { sessionStore, type View } from '../state/session-store';
export function useHistoryScroll(
  ref: RefObject<HTMLElement | null>,
  view: View,
  mode: 'trace' | 'chat',
  active: boolean,
  id: string | null,
) {
  const navigation = useRef(0);
  const previous = useRef({
    id: '',
    height: 0,
    top: 0,
    events: view.events,
    active: false,
  });
  useLayoutEffect(() => {
    const pane = ref.current;
    if (!pane || !active) return;
    const old = previous.current,
      changed = id !== old.id;
    if (changed) pane.scrollTop = mode === 'chat' ? pane.scrollHeight : 0;
    else if (old.events !== view.events && view.change === 'before')
      pane.scrollTop = old.top + pane.scrollHeight - old.height;
    else if (!old.active) pane.scrollTop = view.scrollTop;
    else if (
      mode === 'chat' &&
      old.events !== view.events &&
      old.height - old.top - pane.clientHeight < 80
    )
      pane.scrollTop = pane.scrollHeight;
    if (
      view.navigation &&
      mode === 'trace' &&
      view.navigation.nonce !== navigation.current
    ) {
      const row = Array.from(
        pane.querySelectorAll<HTMLElement>('[data-ref]'),
      ).find((row) => row.dataset.ref === view.navigation!.ref);
      navigation.current = view.navigation.nonce;
      row?.scrollIntoView({
        block: view.navigation.block,
        behavior: sessionStore.state.settings.animations ? 'smooth' : 'instant',
      });
    }
    previous.current = {
      id: id || '',
      height: pane.scrollHeight,
      top: pane.scrollTop,
      events: view.events,
      active: true,
    };
  }, [ref, view.events, view.navigation, active, id, mode, view.change]);
  useLayoutEffect(() => {
    if (!active) {
      previous.current.active = false;
      return;
    }
    const pane = ref.current;
    if (!pane) return;
    const onScroll = () => {
      previous.current.top = pane.scrollTop;
      previous.current.height = pane.scrollHeight;
      sessionStore.updateView({ scrollTop: pane.scrollTop }, mode);
      const latest = sessionStore.state.views[mode];
      if (latest.loading) return;
      if (pane.scrollTop < 120 && latest.offset > 0)
        void sessionStore.loadTrace(false, 'before');
      else if (
        pane.scrollHeight - pane.scrollTop - pane.clientHeight < 180 &&
        latest.next !== null
      )
        void sessionStore.loadTrace(false, 'after');
    };
    pane.addEventListener('scroll', onScroll, { passive: true });
    return () => pane.removeEventListener('scroll', onScroll);
  }, [active, mode, ref]);
}
