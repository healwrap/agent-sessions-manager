import { useLayoutEffect, type RefObject } from 'react';

// Reserve scroll space outside the card when shorter content would move the page.
// Scrolling up releases the reserve; the card always follows its content height.
export function useCollectionScrollFloor(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const region = ref.current!;
    let pane = region.parentElement;
    while (pane && !/auto|scroll/.test(getComputedStyle(pane).overflowY))
      pane = pane.parentElement;
    if (!pane) return;
    const container = pane;
    const sync = () => {
      if (container.scrollTop <= 0) {
        region.style.removeProperty('--collection-scroll-floor');
        return;
      }
      const remaining = Math.max(
        0,
        container.scrollHeight - container.clientHeight - container.scrollTop,
      );
      region.style.setProperty(
        '--collection-scroll-floor',
        `${Math.max(0, Math.ceil(region.getBoundingClientRect().height - remaining))}px`,
      );
    };
    sync();
    container.addEventListener('scroll', sync, { passive: true });
    const resize = new ResizeObserver(sync);
    resize.observe(container);
    return () => {
      container.removeEventListener('scroll', sync);
      resize.disconnect();
      region.style.removeProperty('--collection-scroll-floor');
    };
  }, [ref]);
}
