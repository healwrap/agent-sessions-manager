import { useLayoutEffect, useRef } from 'react';
import { sessionStore } from '../state/session-store';
import type { Session } from '../lib/types';
import { copyContextReference } from '../lib/context-reference';
import { MenuItem, MenuSurface } from './menu-surface';
export interface SessionMenu {
  item: Session;
  x: number;
  y: number;
}
export function SessionActions({
  menu,
  onClose,
}: {
  menu: SessionMenu | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!menu) return;
    const popup = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const place = () => {
      popup.style.left = `${Math.max(12, Math.min(menu.x, window.innerWidth - popup.offsetWidth - 12))}px`;
      popup.style.top = `${Math.max(12, Math.min(menu.y, window.innerHeight - popup.offsetHeight - 12))}px`;
    };
    const click = (e: PointerEvent) => {
        if (!ref.current?.contains(e.target as Node)) onClose();
      },
      key = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        } else if (
          popup.contains(document.activeElement) &&
          ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)
        ) {
          e.preventDefault();
          const buttons = Array.from(popup.querySelectorAll('button'));
          const current = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const index =
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? buttons.length - 1
                : (current + (e.key === 'ArrowUp' ? -1 : 1) + buttons.length) %
                  buttons.length;
          buttons[index]?.focus({ preventScroll: true });
        }
      };
    place();
    window.addEventListener('resize', place);
    document.addEventListener('pointerdown', click);
    document.addEventListener('keydown', key);
    ref.current?.querySelector('button')?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('pointerdown', click);
      document.removeEventListener('keydown', key);
      if (popup.contains(document.activeElement) && previous?.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [menu, onClose]);
  const copyContext = async (id: string) => {
    try {
      await copyContextReference(id);
      sessionStore.notify('已复制整个会话的上下文引用。');
    } catch (error) {
      sessionStore.notify(String(error));
    }
  };
  return menu ? (
    <MenuSurface
      ref={ref}
      className="session-menu"
      role="menu"
      aria-label="会话操作"
      style={{
        left: Math.min(menu.x, window.innerWidth - 210),
        top: Math.min(menu.y, window.innerHeight - 190),
      }}
    >
      <MenuItem
        icon="copy"
        onClick={() => {
          void copyContext(menu.item.id);
          onClose();
        }}
      >
        复制上下文引用
      </MenuItem>
    </MenuSurface>
  ) : null;
}
