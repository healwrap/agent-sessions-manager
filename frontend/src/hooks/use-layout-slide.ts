import { useLayoutEffect, useRef, type RefObject } from 'react';

// Commit the final layout once, then slide the content from its previous position.
export function useLayoutSlide(
  ref: RefObject<HTMLElement | null>,
  changed: boolean,
  enabled: boolean,
) {
  const previousLeft = useRef<number | null>(null);
  const running = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const transform = getComputedStyle(node).transform;
    const currentOffset =
      running.current && transform !== 'none'
        ? new DOMMatrixReadOnly(transform).m41
        : 0;
    running.current?.cancel();
    running.current = null;
    const left = node.getBoundingClientRect().left;
    const offset =
      previousLeft.current === null
        ? 0
        : previousLeft.current + currentOffset - left;
    previousLeft.current = left;
    if (
      !enabled ||
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      Math.abs(offset) < 1
    )
      return;
    const animation = node.animate(
      [
        { transform: `translateX(${offset}px)` },
        { transform: 'translateX(0)' },
      ],
      { duration: 180, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
    );
    running.current = animation;
    animation.onfinish = () => {
      if (running.current === animation) running.current = null;
    };
  }, [ref, changed, enabled]);
  useLayoutEffect(() => () => running.current?.cancel(), []);
}
