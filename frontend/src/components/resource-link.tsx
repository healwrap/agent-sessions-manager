import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { copyText } from '../lib/api';
import { isGuideDemo } from '../lib/demo-mode';
import { resourceTarget } from '../lib/resource-links';
import { sessionStore } from '../state/session-store';
import { MenuItem, MenuSurface } from './menu-surface';

export function ResourceLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const resource = resourceTarget(href);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const mac =
    typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  const revealLabel = mac ? '在访达中显示' : '在文件管理器中显示';
  useLayoutEffect(() => {
    if (!menu) return;
    const popup = popupRef.current!;
    popup.style.left = `${Math.max(12, Math.min(menu.x, window.innerWidth - popup.offsetWidth - 12))}px`;
    popup.style.top = `${Math.max(12, Math.min(menu.y, window.innerHeight - popup.offsetHeight - 12))}px`;
    const close = () => setMenu(null);
    const outside = (event: PointerEvent) => {
      if (!popup.contains(event.target as Node)) close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') {
          event.preventDefault();
          linkRef.current?.focus({ preventScroll: true });
        }
        close();
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const buttons = Array.from(popup.querySelectorAll('button'));
        const current = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const index =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (current +
                  (event.key === 'ArrowUp' ? -1 : 1) +
                  buttons.length) %
                buttons.length;
        buttons[index]?.focus({ preventScroll: true });
      }
    };
    popup.querySelector('button')?.focus({ preventScroll: true });
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', close);
    };
  }, [menu]);
  if (!resource) return <>{children}</>;
  const open = async (reveal = false) => {
    setMenu(null);
    if (isGuideDemo) {
      sessionStore.notify('演示模式不会打开本机文件或应用。');
      return;
    }
    try {
      if (!window.__TAURI__?.core)
        throw new Error('请在桌面应用中打开本地文件。');
      await window.__TAURI__.core.invoke('open_resource', {
        target: resource.target,
        cwd:
          sessionStore.view.data?.cwd ||
          sessionStore.view.data?.project_path ||
          null,
        reveal,
      });
    } catch (error) {
      sessionStore.notify(String(error));
    }
  };
  const showMenu = (x: number, y: number) => setMenu({ x, y });
  return (
    <>
      <a
        ref={linkRef}
        href={resource.target}
        target={resource.kind === 'web' ? '_blank' : undefined}
        rel="noreferrer"
        title={
          resource.kind === 'file'
            ? `${resource.target}（点击打开，右键${revealLabel}）`
            : resource.target
        }
        onClick={(event) => {
          if (resource.kind === 'anchor') return;
          if (resource.kind === 'file' || window.__TAURI__?.core) {
            event.preventDefault();
            void open();
          }
        }}
        onAuxClick={(event) => {
          if (
            event.button === 1 &&
            (resource.kind === 'file' || window.__TAURI__?.core) &&
            resource.kind !== 'anchor'
          ) {
            event.preventDefault();
            void open();
          }
        }}
        onContextMenu={(event) => {
          if (resource.kind !== 'file') return;
          event.preventDefault();
          event.stopPropagation();
          showMenu(event.clientX, event.clientY);
        }}
        onKeyDown={(event) => {
          if (
            resource.kind === 'file' &&
            (event.key === 'ContextMenu' ||
              (event.shiftKey && event.key === 'F10'))
          ) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            showMenu(rect.left, rect.bottom);
          }
        }}
      >
        {children}
      </a>
      {menu &&
        createPortal(
          <MenuSurface
            ref={popupRef}
            className="resource-menu"
            role="menu"
            aria-label="文件操作"
            style={{ left: menu.x, top: menu.y }}
          >
            <MenuItem icon="jump" onClick={() => void open()}>
              用默认程序打开
            </MenuItem>
            <MenuItem icon="folder" onClick={() => void open(true)}>
              {revealLabel}
            </MenuItem>
            <MenuItem
              icon="copy"
              onClick={() => {
                setMenu(null);
                void copyText(resource.target)
                  .then(() => sessionStore.notify('已复制文件地址。'))
                  .catch((error) => sessionStore.notify(String(error)));
              }}
            >
              复制文件地址
            </MenuItem>
          </MenuSurface>,
          document.body,
        )}
    </>
  );
}
