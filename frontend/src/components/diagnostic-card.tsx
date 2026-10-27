import type { ReactNode } from 'react';
import type { CheckState } from '../lib/claude-diagnostics';
import { Panel, StatusBadge } from './ui';

export function DiagnosticBadge({
  state = 'unknown',
  children,
}: {
  state?: CheckState;
  children: ReactNode;
}) {
  return (
    <StatusBadge
      tone={
        state === 'pass'
          ? 'success'
          : state === 'fail'
            ? 'error'
            : state === 'warn'
              ? 'warning'
              : 'neutral'
      }
    >
      {children}
    </StatusBadge>
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
    <Panel
      className={'diagnostic-card ' + className}
      aria-label={title}
      title={title}
      icon={icon}
      actions={extra}
    >
      {children}
    </Panel>
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
