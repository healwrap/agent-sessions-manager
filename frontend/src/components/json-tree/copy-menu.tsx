import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface CopyMenuItem {
  id: string;
  label: string;
}

// Host adapter for DSH's JSON copy actions; the portal avoids clipping by detail panes.
export function CopyMenu({
  open,
  anchor,
  items,
  onSelect,
  onClose,
  getAnchorRect,
}: {
  open: boolean;
  anchor: ReactNode;
  items: readonly CopyMenuItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
  getAnchorRect: () => DOMRect;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = getAnchorRect();
      const width = list.current?.offsetWidth || 180;
      const height = list.current?.offsetHeight || 90;
      setPosition({
        left: Math.max(
          12,
          Math.min(rect.right - width, window.innerWidth - width - 12),
        ),
        top: Math.max(
          12,
          Math.min(rect.bottom + 4, window.innerHeight - height - 12),
        ),
      });
    };
    const close = () => {
      root.current?.querySelector('button')?.focus();
      onClose();
    };
    const pointer = (event: PointerEvent) => {
      if (
        !list.current?.contains(event.target as Node) &&
        !root.current?.contains(event.target as Node)
      )
        close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      const buttons = Array.from(
        list.current?.querySelectorAll<HTMLButtonElement>('button') || [],
      );
      const current = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      if (current < 0 && !root.current?.contains(document.activeElement))
        return;
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const index =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (current +
                  (event.key === 'ArrowUp' ? -1 : 1) +
                  buttons.length) %
                buttons.length;
        buttons[index]?.focus();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        if (event.shiftKey) close();
        else if (current < 0) buttons[0]?.focus();
        else buttons[current]?.click();
      }
    };
    place();
    root.current?.querySelector('button')?.focus();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    document.addEventListener('pointerdown', pointer);
    document.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('pointerdown', pointer);
      document.removeEventListener('keydown', key);
    };
  }, [open, getAnchorRect, onClose]);
  return (
    <span ref={root}>
      {anchor}
      {open &&
        createPortal(
          <div
            ref={list}
            role="menu"
            aria-label="JSON 复制选项"
            className="json-copy-menu"
            style={position}
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  root.current?.querySelector('button')?.focus();
                  onSelect(item.id);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}
