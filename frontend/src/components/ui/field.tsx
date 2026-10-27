import type { ReactNode } from 'react';

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="ui-form-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}
