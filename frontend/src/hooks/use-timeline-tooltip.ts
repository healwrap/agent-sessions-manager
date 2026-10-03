import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Event } from '../lib/types';
import { timelineTooltip } from '../lib/timeline-tooltip';

export interface TimelineHint {
  id: string;
  record: string;
  label: string;
  x: number;
  top: number;
  bottom: number;
}
export function useTimelineTooltip(scope: string, disabled: boolean) {
  const id = useId(),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    [hint, setHint] = useState<TimelineHint | null>(null);
  const dismiss = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setHint(null);
  }, []);
  useEffect(() => {
    dismiss();
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [scope, disabled, dismiss]);
  const show = (anchor: HTMLElement, event: Event, delay = 500) => {
    dismiss();
    if (disabled) return;
    const open = () => {
      timer.current = null;
      if (!anchor.isConnected) return;
      const rect = anchor.getBoundingClientRect();
      setHint({
        id,
        record: event.ref,
        label: timelineTooltip(event),
        x: rect.left + rect.width / 2,
        top: rect.top,
        bottom: rect.bottom,
      });
    };
    if (delay) timer.current = setTimeout(open, delay);
    else open();
  };
  return { hint, show, dismiss };
}
