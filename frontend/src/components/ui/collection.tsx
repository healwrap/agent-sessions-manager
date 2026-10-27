import type { ReactNode } from 'react';
import { SearchField } from '../search-field';

export function ChoiceGroup<T extends string>({
  label,
  value,
  onChange,
  items,
  variant = 'segmented',
  className = '',
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  items: {
    value: T;
    label: ReactNode;
    count?: number;
    icon?: ReactNode;
    disabled?: boolean;
  }[];
  variant?: 'segmented' | 'tabs';
  className?: string;
}) {
  return (
    <div
      className={`ui-choices ${className}`}
      data-variant={variant}
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
          return;
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            'button:not(:disabled)',
          ),
        );
        const current = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (current < 0) return;
        event.preventDefault();
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (current +
                  (event.key === 'ArrowLeft' ? -1 : 1) +
                  buttons.length) %
                buttons.length;
        buttons[next].focus();
        buttons[next].click();
      }}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={value === item.value}
          disabled={item.disabled}
          onClick={() => onChange(item.value)}
        >
          {item.icon}
          {item.label}
          {item.count !== undefined && <span>{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function CollectionToolbar({
  query,
  onQuery,
  searchLabel,
  placeholder,
  children,
  className = '',
}: {
  query: string;
  onQuery: (value: string) => void;
  searchLabel: string;
  placeholder?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ui-collection-toolbar ${className}`}>
      <div className="ui-collection-controls">{children}</div>
      <SearchField
        label={searchLabel}
        placeholder={placeholder || searchLabel}
        value={query}
        onChange={onQuery}
      />
    </div>
  );
}
