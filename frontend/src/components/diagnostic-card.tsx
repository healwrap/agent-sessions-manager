import type { ReactNode } from 'react';
import type { CheckState } from '../lib/claude-diagnostics';

export function DiagnosticBadge({
  state = 'unknown',
  children,
}: {
  state?: CheckState;
  children: ReactNode;
}) {
  return (
    <span className="diagnostic-badge" data-state={state}>
      {children}
    </span>
  );
}

export function DiagnosticCard({
  title,
  icon,
  extra,
  className = '',
  children,
}: {
  title: string;
  icon?: ReactNode;
  extra?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={'diagnostic-card ' + className} aria-label={title}>
      <header className="diagnostic-card-heading">
        <h3>
          {icon}
          {title}
        </h3>
        {extra}
      </header>
      {children}
    </section>
  );
}

export function DiagnosticField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="diagnostic-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
