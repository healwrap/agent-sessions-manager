import {
  forwardRef,
  type HTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Icon } from './primitives';

// DSH MenuSurface material and MenuItemButton geometry; owners retain their actions.
export const MenuSurface = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function MenuSurface({ className = '', children, ...props }, ref) {
  return (
    <div
      {...props}
      ref={ref}
      className={`dsh-menu ${className}`}
      data-menu-material="translucent"
    >
      <div className="dsh-menu-material" aria-hidden="true" />
      <div className="dsh-menu-viewport">{children}</div>
    </div>
  );
});

export function MenuItem({
  icon,
  trailing,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: string;
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
          <Icon name={icon} />
        </span>
      )}
      <span className="dsh-menu-label">{children}</span>
      {trailing}
    </button>
  );
}
