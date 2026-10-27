import type { ReactNode } from 'react';
import { LeadingIcon, Panel } from './layout';

type ResourceProps = {
  title: string;
  subtitle?: ReactNode;
  icon: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

function ResourceContent({
  title,
  subtitle,
  icon,
  badge,
  actions,
  children,
  footer,
}: ResourceProps) {
  return (
    <>
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
    </>
  );
}

export function ResourceCard(props: ResourceProps) {
  return (
    <Panel
      className={`ui-resource ${props.className || ''}`}
      padding="none"
      aria-label={props.title}
    >
      <ResourceContent {...props} />
    </Panel>
  );
}

export function ResourceRow(props: ResourceProps) {
  return (
    <article
      className={`ui-resource ui-resource-row ${props.className || ''}`}
      aria-label={props.title}
      role="listitem"
    >
      <ResourceContent {...props} />
    </article>
  );
}
