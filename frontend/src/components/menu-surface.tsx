import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './primitives';

// DSH MenuSurface material and MenuItemButton geometry; owners retain their actions.
export const MenuSurface = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function MenuSurface({ className = '', style, children, ...props }, ref) {
  const surface = useRef<HTMLDivElement>(null);
  const backing = useRef<HTMLDivElement>(null);
  const [backingHost, setBackingHost] = useState<HTMLElement | null>(null);
  useImperativeHandle(ref, () => surface.current!, []);
  useLayoutEffect(() => {
    // A dialog already supplies an opaque surface above native window vibrancy.
    if (!surface.current?.closest('dialog')) setBackingHost(document.body);
  }, []);
  useLayoutEffect(() => {
    const popup = surface.current;
    const layer = backing.current;
    if (!popup || !layer) return;
    document.body.appendChild(layer);
    // CSS anchors cannot target a popover from the page behind its top layer.
    // Track the actual bounds for both popovers and ordinary menu portals.
    const sync = () => {
      const rect = popup.getBoundingClientRect();
      Object.assign(layer.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        visibility:
          rect.width && rect.height
            ? getComputedStyle(popup).visibility
            : 'hidden',
      });
    };
    sync();
    const resize = new ResizeObserver(sync);
    resize.observe(popup);
    const placement = new MutationObserver(sync);
    placement.observe(popup, { attributes: true, attributeFilter: ['style'] });
    popup.addEventListener('toggle', sync);
    return () => {
      resize.disconnect();
      placement.disconnect();
      popup.removeEventListener('toggle', sync);
    };
  }, [backingHost]);
  return (
    <>
      <div
        {...props}
        ref={surface}
        style={style}
        className={`dsh-menu ${className}`}
        data-menu-material="translucent"
      >
        <div className="dsh-menu-material" aria-hidden="true" />
        <div className="dsh-menu-viewport">{children}</div>
      </div>
      {backingHost &&
        createPortal(
          <div
            ref={backing}
            className="dsh-menu-backing"
            data-menu-backing=""
            aria-hidden="true"
          />,
          backingHost,
        )}
    </>
  );
});

export function MenuItem({
  icon,
  trailing,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      {...props}
      className={`dsh-menu-item ${className}`}
    >
      {icon && (
        <span className="dsh-menu-icon">
          {typeof icon === 'string' ? <Icon name={icon} /> : icon}
        </span>
      )}
      <span className="dsh-menu-label">{children}</span>
      {trailing}
    </button>
  );
}
