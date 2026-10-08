import { useEffect, useRef } from 'react';
import { Icon } from './primitives';

export function SearchField({
  value,
  onChange,
  label,
  placeholder = '搜索',
  className = '',
  compact = false,
  active = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  compact?: boolean;
  active?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (active) input.current?.focus({ preventScroll: true });
  }, [active]);
  const clear = () => {
    onChange('');
    input.current?.focus({ preventScroll: true });
  };
  return (
    <div className={'search-field ' + className} data-compact={compact}>
      <Icon name="search" className="search-field-icon" />
      <input
        ref={input}
        className="search-field-input"
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === 'Escape' &&
            !event.nativeEvent.isComposing &&
            value
          ) {
            event.preventDefault();
            event.stopPropagation();
            clear();
          }
        }}
      />
      {value && (
        <button
          type="button"
          className="search-field-clear"
          aria-label={'清除' + label}
          title="清除搜索"
          onClick={clear}
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}
