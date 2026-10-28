export function Switch({
  id,
  label,
  descriptionId,
  checked,
  onChange,
  disabled = false,
}: {
  id?: string;
  label: string;
  descriptionId?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      type="checkbox"
      role="switch"
      className="form-switch"
      aria-label={label}
      aria-describedby={descriptionId}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}
