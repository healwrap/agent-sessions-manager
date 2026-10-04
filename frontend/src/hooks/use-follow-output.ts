import { useLayoutEffect, useRef, type RefObject } from 'react';

// Follow a growing process/output pane until the user scrolls away from its tail.
export function useFollowOutput(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  revision: unknown,
) {
  const following = useRef(true);
  const previous = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const pane = ref.current;
    if (!enabled || !pane) return;
    if (previous.current !== pane) following.current = true;
    previous.current = pane;
    const follow = () => {
      if (following.current) pane.scrollTop = pane.scrollHeight;
    };
    const onScroll = () => {
      following.current =
        pane.scrollHeight - pane.clientHeight - pane.scrollTop < 24;
    };
    follow();
    const changes = new MutationObserver(follow);
    const sizes = new ResizeObserver(follow);
    changes.observe(pane, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    if (pane.firstElementChild) sizes.observe(pane.firstElementChild);
    pane.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      changes.disconnect();
      sizes.disconnect();
      pane.removeEventListener('scroll', onScroll);
    };
  }, [ref, enabled, revision]);
}
