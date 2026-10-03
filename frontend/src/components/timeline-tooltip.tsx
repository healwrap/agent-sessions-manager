import { useLayoutEffect, useRef } from 'react';
import type { TimelineHint } from '../hooks/use-timeline-tooltip';

export function TimelineTooltip({ hint }: { hint: TimelineHint | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const bubble = ref.current;
    if (!bubble || !hint) return;
    const fit = () => {
      const { width, height } = bubble.getBoundingClientRect();
      const left = Math.max(
        12,
        Math.min(hint.x - width / 2, window.innerWidth - 12 - width),
      );
      const above =
        hint.bottom + 8 + height > window.innerHeight - 12 &&
        hint.top - 8 - height >= 12;
      bubble.style.left = `${left}px`;
      bubble.style.top = `${above ? hint.top - 8 - height : hint.bottom + 8}px`;
      bubble.style.visibility = 'visible';
    };
    const observer = new ResizeObserver(fit);
    observer.observe(bubble);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [hint]);
  return hint ? (
    <span
      ref={ref}
      id={hint.id}
      role="tooltip"
      className="timeline-tooltip"
      style={{ visibility: 'hidden' }}
    >
      {hint.label}
    </span>
  ) : null;
}
