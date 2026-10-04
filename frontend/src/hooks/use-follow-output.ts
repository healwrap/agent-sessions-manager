import { useLayoutEffect, useRef, type RefObject } from 'react';
import { ScrollPosition } from '../lib/scroll-position';

// Follow growing output until the user scrolls upward; resume at its actual tail.
export function useFollowOutput(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  revision: unknown,
) {
  const position = useRef<ScrollPosition | null>(null);
  useLayoutEffect(() => {
    const pane = ref.current;
    if (!enabled || !pane) return;
    if (!position.current || position.current.pane !== pane) {
      position.current = new ScrollPosition(pane);
      position.current.following = true;
    }
    const scroll = position.current;
    const follow = () => {
      if (!pane.clientHeight) return;
      if (scroll.following) scroll.move(scroll.maximum);
      else scroll.restore();
      scroll.capture();
    };
    const onScroll = () => scroll.trackScroll();
    follow();
    const changes = new MutationObserver(follow);
    const sizes = new ResizeObserver(follow);
    changes.observe(pane, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    sizes.observe(pane);
    if (pane.firstElementChild) sizes.observe(pane.firstElementChild);
    pane.addEventListener('scroll', onScroll, { passive: true });
    pane.addEventListener('wheel', scroll.pauseOnUpwardInput, {
      passive: true,
    });
    pane.addEventListener('keydown', scroll.pauseOnUpwardKey);
    return () => {
      changes.disconnect();
      sizes.disconnect();
      pane.removeEventListener('scroll', onScroll);
      pane.removeEventListener('wheel', scroll.pauseOnUpwardInput);
      pane.removeEventListener('keydown', scroll.pauseOnUpwardKey);
    };
  }, [ref, enabled, revision]);
}
