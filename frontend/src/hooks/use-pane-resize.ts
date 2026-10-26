import interact from 'interactjs';
import {
  useCallback,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
} from 'react';

interface PaneResizeOptions {
  edge: 'left' | 'right';
  width?: number | null;
  min: number;
  max: (pane: HTMLElement) => number;
  property: string;
  target?: (pane: HTMLElement) => HTMLElement;
  onStart?: (pane: HTMLElement) => void;
  onMove?: (width: number, pane: HTMLElement) => void;
  onCommit: (width?: number) => void;
  onReset?: (pane: HTMLElement) => void;
}

// Both panel edges share one pointer engine, keyboard behavior and styling.
export function usePaneResize(options: PaneResizeOptions) {
  const latest = useRef(options);
  latest.current = options;
  const handleRef = useRef<HTMLDivElement | null>(null);
  const apply = (width?: number | null) => {
    const pane = handleRef.current?.parentElement;
    if (!pane) return;
    const current = latest.current;
    const target = current.target?.(pane) ?? pane;
    if (width == null) target.style.removeProperty(current.property);
    else {
      const next = Math.round(
        Math.max(
          Math.min(current.min, current.max(pane)),
          Math.min(width, current.max(pane)),
        ),
      );
      target.style.setProperty(current.property, `${next}px`);
      current.onMove?.(next, pane);
    }
  };
  const ref = useCallback((handle: HTMLDivElement | null) => {
    handleRef.current = handle;
    const pane = handle?.parentElement;
    if (!handle || !pane) return;
    handle.classList.add('pane-resize-handle');
    handle.title = '拖动调整宽度，方向键微调，双击恢复默认';
    let startWidth = 0;
    const measure = () => {
      const current = latest.current;
      handle.setAttribute(
        'aria-valuenow',
        String(Math.round(pane.getBoundingClientRect().width)),
      );
      handle.setAttribute(
        'aria-valuemin',
        String(Math.min(current.min, current.max(pane))),
      );
      handle.setAttribute('aria-valuemax', String(current.max(pane)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    if (pane.parentElement) observer.observe(pane.parentElement);
    const interaction = interact(pane).resizable({
      edges: { [latest.current.edge]: handle },
      inertia: false,
      modifiers: [
        interact.modifiers.restrictSize({
          min: () => ({
            top: 0,
            left: 0,
            right: latest.current.min,
            bottom: 0,
            width: latest.current.min,
            height: 0,
          }),
          max: () => ({
            top: 0,
            left: 0,
            right: latest.current.max(pane),
            bottom: Infinity,
            width: latest.current.max(pane),
            height: Infinity,
          }),
        }),
      ],
      listeners: {
        start: () => {
          startWidth = pane.getBoundingClientRect().width;
          latest.current.onStart?.(pane);
          handle.setAttribute('data-resizing', 'true');
        },
        move: (event) => apply(event.rect.width),
        end: () => {
          handle.removeAttribute('data-resizing');
          const width = Math.round(pane.getBoundingClientRect().width);
          if (Math.abs(width - startWidth) >= 1) latest.current.onCommit(width);
        },
      },
    });
    measure();
    return () => {
      interaction.unset();
      observer.disconnect();
      handleRef.current = null;
    };
  }, []);
  useLayoutEffect(() => apply(options.width), [options.width]);
  return {
    ref,
    'data-resize-edge': options.edge,
    onDoubleClick: () => {
      const pane = handleRef.current?.parentElement;
      apply();
      if (pane) latest.current.onReset?.(pane);
      latest.current.onCommit();
    },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
        return;
      event.preventDefault();
      const pane = event.currentTarget.parentElement!;
      const current = latest.current;
      const direction = current.edge === 'right' ? 1 : -1;
      const next =
        event.key === 'Home'
          ? current.min
          : event.key === 'End'
            ? current.max(pane)
            : pane.getBoundingClientRect().width +
              (event.key === 'ArrowRight' ? 16 : -16) * direction;
      current.onStart?.(pane);
      apply(next);
      current.onCommit(Math.round(pane.getBoundingClientRect().width));
    },
  };
}
