import type { ReactNode } from 'react';

export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <label htmlFor={htmlFor}>{label}</label>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
