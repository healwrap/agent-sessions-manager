import { useRef, type HTMLAttributes } from 'react';
import { sessionStore, type AppState } from '../state/session-store';

const clamp = (width: number, split: number) =>
  Math.round(
    Math.min(Math.max(320, width), Math.max(320, Math.min(720, split - 280))),
  );
const defaultToolWidth = (width: number) =>
  Math.min(480, Math.max(180, width * 0.36 - 56));
export function useDetailResize(
  state: AppState,
): HTMLAttributes<HTMLDivElement> {
  const drag = useRef<{
    pointer: number;
    x: number;
    width: number;
    split: number;
    offset: number;
  } | null>(null);
  const dimensions = (handle: HTMLElement) => {
    const details = handle.parentElement,
      split = details?.closest<HTMLElement>('.split');
    if (!details || !split) return null;
    const width = details.getBoundingClientRect().width,
      splitWidth = split.getBoundingClientRect().width;
    return {
      width,
      split: splitWidth,
      offset:
        state.toolRequestOffset ??
        splitWidth * 0.58 - defaultToolWidth(splitWidth),
    };
  };
  const update = (
    width: number,
    start: { width: number; split: number; offset: number },
  ) => {
    const next = clamp(width, start.split);
    sessionStore.update({
      detailWidth: next,
      toolRequestOffset: start.offset + (next - start.width) * 0.58,
    });
  };
  return {
    onDoubleClick: () =>
      sessionStore.update({ detailWidth: 400, toolRequestOffset: null }),
    onKeyDown: (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const start = dimensions(event.currentTarget);
      if (!start) return;
      event.preventDefault();
      update(start.width + (event.key === 'ArrowLeft' ? 16 : -16), start);
    },
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      const start = dimensions(event.currentTarget);
      if (!start) return;
      drag.current = { ...start, pointer: event.pointerId, x: event.clientX };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    onPointerMove: (event) => {
      const start = drag.current;
      if (start?.pointer === event.pointerId)
        update(start.width + start.x - event.clientX, start);
    },
    onPointerUp: (event) => {
      if (drag.current?.pointer !== event.pointerId) return;
      drag.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: () => {
      drag.current = null;
    },
  };
}
