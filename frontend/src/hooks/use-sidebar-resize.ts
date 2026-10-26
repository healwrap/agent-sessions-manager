import {
  useCallback,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type RefCallback,
} from 'react';
import { sessionStore } from '../state/session-store';

const maximum = () => Math.max(180, Math.min(520, window.innerWidth - 360));
const clamp = (value: number) =>
  Math.round(Math.max(180, Math.min(value, maximum())));

export function useSidebarResize(
  width?: number,
): HTMLAttributes<HTMLDivElement> & { ref: RefCallback<HTMLDivElement> } {
  const handleRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(
    null,
  );
  const apply = (value?: number) => {
    const slot = handleRef.current?.parentElement;
    if (value == null) slot?.style.removeProperty('--sidebar-user-width');
    else slot?.style.setProperty('--sidebar-user-width', `${clamp(value)}px`);
  };
  const save = (value?: number) => {
    const { sidebarWidth: _, ...preferences } = sessionStore.state.preferences;
    void sessionStore.savePreferences(
      value == null
        ? preferences
        : { ...preferences, sidebarWidth: clamp(value) },
    );
  };
  const ref = useCallback<RefCallback<HTMLDivElement>>((handle) => {
    handleRef.current = handle;
    const slot = handle?.parentElement;
    if (!handle || !slot) return;
    const measure = () => {
      handle.setAttribute(
        'aria-valuenow',
        String(Math.round(slot.getBoundingClientRect().width)),
      );
      handle.setAttribute('aria-valuemax', String(maximum()));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    return () => {
      observer.disconnect();
      handleRef.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    apply(width);
  }, [width]);
  const finish = () => {
    if (!drag.current) return;
    const previous = drag.current.width;
    drag.current = null;
    handleRef.current?.removeAttribute('data-resizing');
    const current =
      handleRef.current?.parentElement?.getBoundingClientRect().width;
    if (current && Math.abs(current - previous) >= 1) save(current);
  };
  return {
    ref,
    onDoubleClick: () => {
      apply();
      save();
    },
    onKeyDown: (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
        return;
      event.preventDefault();
      const current =
        event.currentTarget.parentElement!.getBoundingClientRect().width;
      const next =
        event.key === 'Home'
          ? 180
          : event.key === 'End'
            ? maximum()
            : current + (event.key === 'ArrowRight' ? 16 : -16);
      apply(next);
      save(next);
    },
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      drag.current = {
        pointer: event.pointerId,
        x: event.clientX,
        width: event.currentTarget.parentElement!.getBoundingClientRect().width,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.setAttribute('data-resizing', 'true');
      event.preventDefault();
    },
    onPointerMove: (event) => {
      const start = drag.current;
      if (start?.pointer === event.pointerId)
        apply(start.width + event.clientX - start.x);
    },
    onPointerUp: (event) => {
      if (drag.current?.pointer !== event.pointerId) return;
      finish();
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: finish,
    onLostPointerCapture: finish,
  };
}
