import { useLayoutEffect, type RefObject } from 'react';

// Keep enough space below the current viewport when filtered details shrink.
// Scrolling back up releases that space instead of keeping the tallest panel.
export function useCollectionScrollFloor(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const panel = ref.current!;
    let pane = panel.parentElement;
    while (pane && !/auto|scroll/.test(getComputedStyle(pane).overflowY))
      pane = pane.parentElement;
    if (!pane) return;
    const container = pane;
    const sync = () => {
      const remaining = Math.max(
        0,
        container.scrollHeight - container.clientHeight - container.scrollTop,
      );
      panel.style.setProperty(
        '--collection-scroll-floor',
        `${Math.max(0, Math.ceil(panel.getBoundingClientRect().height - remaining))}px`,
      );
    };
    sync();
    container.addEventListener('scroll', sync, { passive: true });
    const resize = new ResizeObserver(sync);
    resize.observe(container);
    return () => {
      container.removeEventListener('scroll', sync);
      resize.disconnect();
      panel.style.removeProperty('--collection-scroll-floor');
    };
  }, [ref]);
}
