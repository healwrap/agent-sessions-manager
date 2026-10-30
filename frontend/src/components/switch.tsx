import { LoaderCircle } from 'lucide-react';

export function Switch({
  id,
  label,
  descriptionId,
  checked,
  onChange,
  disabled = false,
  loading = false,
}: {
  id?: string;
  label: string;
  descriptionId?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      className="form-switch"
      aria-label={label}
      aria-describedby={descriptionId}
      aria-checked={checked}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      onClick={() => onChange(!checked)}
    >
      <span className="form-switch-thumb" aria-hidden="true">
        {loading && <LoaderCircle className="ui-spin" size={12} />}
      </span>
    </button>
  );
}
