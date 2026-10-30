import type { CSSProperties, ReactNode } from 'react';
import { SearchField } from '../search-field';
import { Panel } from './layout';
import { usePaneResize } from '../../hooks/use-pane-resize';

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
      style={
        {
          '--dsh-segment-count': items.length,
          '--dsh-segment-index': items.findIndex(
            (item) => item.value === value,
          ),
        } as CSSProperties
      }
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
        buttons[next].focus({ preventScroll: true });
        buttons[next].click();
      }}
    >
      <span className="ui-choice-indicator" aria-hidden="true" />
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

export function CollectionPanel({
  toolbar,
  children,
  className = '',
}: {
  toolbar: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={`ui-collection-panel ${className}`} padding="none">
      <div className="ui-collection-panel-toolbar">{toolbar}</div>
      <div className="ui-collection-panel-body">{children}</div>
    </Panel>
  );
}

export function MasterDetail({
  navigation,
  children,
  navigationWidth,
  onNavigationResize,
}: {
  navigation: ReactNode;
  children: ReactNode;
  navigationWidth?: number;
  onNavigationResize?: (width?: number) => void;
}) {
  const resize = usePaneResize({
    edge: 'right',
    width: navigationWidth,
    min: 220,
    max: (pane) =>
      Math.max(220, Math.min(520, pane.parentElement!.clientWidth - 360)),
    property: '--master-navigation-width',
    target: (pane) => pane.parentElement!,
    onCommit: (width) => onNavigationResize?.(width),
  });
  return (
    <div className="ui-master-detail">
      <div className="ui-master-navigation">
        {navigation}
        {onNavigationResize && (
          <div
            role="separator"
            aria-label="调整列表宽度"
            aria-orientation="vertical"
            tabIndex={0}
            {...resize}
          />
        )}
      </div>
      <div className="ui-master-content">{children}</div>
    </div>
  );
}
