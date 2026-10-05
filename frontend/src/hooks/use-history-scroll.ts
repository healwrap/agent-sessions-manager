import { useLayoutEffect, useRef, type RefObject } from 'react';
import { sessionStore, type View } from '../state/session-store';
import { ScrollPosition } from '../lib/scroll-position';
import { useHistoryAutofill } from './use-history-autofill';

export function useHistoryScroll(
  ref: RefObject<HTMLElement | null>,
  view: View,
  mode: 'trace' | 'chat',
  active: boolean,
  id: string | null,
) {
  const navigation = useRef(0);
  const position = useRef<ScrollPosition | null>(null);
  const previous = useRef({ id: '', active: false });

  useLayoutEffect(() => {
    const pane = ref.current;
    if (!pane || !active) return;
    const old = previous.current;
    if (!position.current || position.current.pane !== pane)
      position.current = new ScrollPosition(pane);
    const scroll = position.current;
    if (id !== old.id) {
      scroll.following = mode === 'chat';
      scroll.move(mode === 'chat' ? scroll.maximum : 0);
    } else if (!old.active && !scroll.height) {
      scroll.move(sessionStore.scrollPosition(mode));
    } else if (mode === 'chat' && scroll.following) {
      scroll.move(scroll.maximum);
    } else if (
      !old.active ||
      pane.scrollHeight !== scroll.height ||
      pane.clientHeight !== scroll.clientHeight
    )
      scroll.restore();

    if (
      view.navigation &&
      mode === 'trace' &&
      view.navigation.nonce !== navigation.current
    ) {
      const row = Array.from(
        pane.querySelectorAll<HTMLElement>('[data-ref]'),
      ).find((row) => row.dataset.ref === view.navigation!.ref);
      navigation.current = view.navigation.nonce;
      if (row) {
        const top =
          pane.scrollTop +
          row.getBoundingClientRect().top -
          pane.getBoundingClientRect().top -
          pane.clientTop;
        const bottom = top + row.offsetHeight;
        const target =
          view.navigation.block === 'center'
            ? top - (pane.clientHeight - row.offsetHeight) / 2
            : top < pane.scrollTop
              ? top
              : bottom > pane.scrollTop + pane.clientHeight
                ? bottom - pane.clientHeight
                : pane.scrollTop;
        pane.scrollTo({
          top: Math.max(0, Math.min(target, scroll.maximum)),
          // Native WebView scroll tiles can be stale after replacing a page.
          behavior:
            sessionStore.state.settings.animations &&
            !view.navigation.paged &&
            !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
            Math.abs(target - pane.scrollTop) < pane.clientHeight
              ? 'smooth'
              : 'instant',
        });
      }
    }
    scroll.capture();
    sessionStore.rememberScroll(mode, scroll.top);
    previous.current = { id: id || '', active: true };
  });

  useLayoutEffect(() => {
    if (!active) {
      previous.current.active = false;
      return;
    }
    const scroll = position.current;
    if (!scroll) return;
    const pane = scroll.pane;
    let disclosureFrame = 0;
    const onDisclosureClick = (event: MouseEvent) => {
      if (mode !== 'chat' || !(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>(
        'button.chat-disclosure[aria-expanded="true"], button.chat-process-summary[aria-expanded="true"]',
      );
      if (!button || button.disabled || !pane.contains(button)) return;
      // Read the sticky heading before React removes its expanded content.
      scroll.holdDisclosure(button);
      cancelAnimationFrame(disclosureFrame);
      disclosureFrame = requestAnimationFrame(() => {
        scroll.restoreDisclosure();
        scroll.capture();
        sessionStore.rememberScroll(mode, scroll.top);
      });
    };
    const loadAtEdge = (direction: number) => {
      const latest = sessionStore.state.views[mode];
      if (latest.loading) return;
      // Restoration and resize must not start pagination.
      if (direction < 0 && scroll.top < 120 && latest.offset > 0)
        void sessionStore.loadTrace(false, 'before');
      else if (
        direction > 0 &&
        scroll.maximum - scroll.top < 180 &&
        latest.next !== null
      )
        void sessionStore.loadTrace(false, 'after');
    };
    const onScroll = () => {
      if (!pane.clientHeight) return;
      const direction = scroll.trackScroll();
      sessionStore.rememberScroll(mode, scroll.top);
      loadAtEdge(direction);
    };
    const onWheel = (event: WheelEvent) => {
      scroll.pauseOnUpwardInput(event);
      // At an edge there may be no scroll event, but the user still wants more.
      if (
        !event.ctrlKey &&
        !event.shiftKey &&
        scroll.ownsScrollInput(event.target)
      )
        loadAtEdge(Math.sign(event.deltaY));
    };
    const observer = new ResizeObserver(() => {
      if (!pane.clientHeight) return;
      if (
        pane.scrollHeight !== scroll.height ||
        pane.clientHeight !== scroll.clientHeight
      ) {
        if (mode === 'chat' && scroll.following) scroll.move(scroll.maximum);
        else scroll.restore();
        scroll.capture();
        sessionStore.rememberScroll(mode, scroll.top);
      }
    });
    observer.observe(pane);
    for (const child of pane.children) observer.observe(child);
    pane.addEventListener('scroll', onScroll, { passive: true });
    pane.addEventListener('wheel', onWheel, {
      passive: true,
    });
    pane.addEventListener('keydown', scroll.pauseOnUpwardKey);
    pane.addEventListener('click', onDisclosureClick, true);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(disclosureFrame);
      scroll.releaseDisclosure();
      pane.removeEventListener('scroll', onScroll);
      pane.removeEventListener('wheel', onWheel);
      pane.removeEventListener('keydown', scroll.pauseOnUpwardKey);
      pane.removeEventListener('click', onDisclosureClick, true);
    };
  }, [active, id, mode, ref]);

  useHistoryAutofill(ref, view, mode, active, id);
}
