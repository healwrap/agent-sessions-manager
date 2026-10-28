import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

// App-owned controls keep number fields consistent across native WebViews.
export function NumberField({
  id,
  label,
  descriptionId,
  value,
  min,
  max,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  descriptionId?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const normalize = () => {
    const number = text.trim() ? Number(text) : value;
    return Math.min(
      max,
      Math.max(min, Number.isFinite(number) ? Math.round(number) : value),
    );
  };
  const commit = (next = normalize()) => {
    setText(String(next));
    if (next !== value) onChange(next);
  };
  const step = (direction: number) =>
    commit(Math.min(max, Math.max(min, normalize() + direction)));
  return (
    <div className="number-field" data-disabled={disabled}>
      <button
        type="button"
        className="number-field-step"
        aria-label={'减小' + label}
        disabled={disabled || normalize() <= min}
        onClick={() => step(-1)}
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <input
        id={id}
        className="number-field-input"
        type="number"
        aria-label={label}
        aria-describedby={descriptionId}
        min={min}
        max={max}
        step={1}
        inputMode="numeric"
        value={text}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const number = Number(next);
          if (
            next.trim() &&
            Number.isInteger(number) &&
            number >= min &&
            number <= max
          )
            onChange(number);
        }}
        onBlur={() => commit()}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            step(event.key === 'ArrowUp' ? 1 : -1);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
      <button
        type="button"
        className="number-field-step"
        aria-label={'增大' + label}
        disabled={disabled || normalize() >= max}
        onClick={() => step(1)}
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
