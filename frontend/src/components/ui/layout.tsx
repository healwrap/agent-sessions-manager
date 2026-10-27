import type { ComponentProps, ReactNode } from 'react';

export function PageHeading({
  title,
  count,
  icon,
  actions,
}: {
  title: string;
  count?: number;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ui-page-heading">
      <div>
        {icon && <LeadingIcon>{icon}</LeadingIcon>}
        <h1>{title}</h1>
        {count !== undefined && <span className="ui-count">{count}</span>}
      </div>
      <div className="ui-actions">{actions}</div>
    </header>
  );
}

export function SectionHeading({
  title,
  icon,
  actions,
  level = 2,
}: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <header className="ui-section-heading">
      <Heading>
        {icon}
        {title}
      </Heading>
      {actions && <div className="ui-actions">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  icon,
  actions,
  children,
  className = '',
  padding = 'normal',
  ...props
}: Omit<ComponentProps<'section'>, 'title'> & {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  padding?: 'normal' | 'none';
}) {
  return (
    <section
      className={`ui-panel ${className}`}
      data-padding={padding}
      {...props}
    >
      {title && <SectionHeading title={title} icon={icon} actions={actions} />}
      {children}
    </section>
  );
}

export function LeadingIcon({ children }: { children: ReactNode }) {
  return (
    <span className="ui-leading-icon" aria-hidden="true">
      {children}
    </span>
  );
}

export interface Fact {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}
export function FactsGrid({
  items,
  columns = 2,
  className = '',
}: {
  items: Fact[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl className={`ui-facts ${className}`} data-columns={columns}>
      {items.map(({ label, value, icon }) => (
        <div key={label}>
          <dt>
            {icon}
            {label}
          </dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
