import type { ReactNode } from 'react';
import { LeadingIcon, Panel } from './layout';

export function ResourceCard({
  title,
  subtitle,
  icon,
  badge,
  actions,
  children,
  footer,
  className = '',
}: {
  title: string;
  subtitle?: ReactNode;
  icon: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Panel
      className={`ui-resource ${className}`}
      padding="none"
      aria-label={title}
    >
      <header className="ui-resource-heading">
        <LeadingIcon>{icon}</LeadingIcon>
        <div className="ui-resource-identity">
          <h2>{title}</h2>
          {subtitle && <span>{subtitle}</span>}
        </div>
        {badge}
        <div className="ui-actions">{actions}</div>
      </header>
      {children && <div className="ui-resource-body">{children}</div>}
      {footer && <div className="ui-resource-footer">{footer}</div>}
    </Panel>
  );
}
