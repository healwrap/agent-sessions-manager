export function ProgressMeter({
  label,
  value,
  max = 100,
  tone: overrideTone,
}: {
  label: string;
  value: number;
  max?: number;
  tone?: 'normal' | 'warning' | 'error';
}) {
  const tone =
    overrideTone ??
    (value >= max ? 'error' : value >= max * 0.8 ? 'warning' : 'normal');
  return (
    <progress
      className="ui-progress-meter"
      aria-label={label}
      value={Math.max(0, Math.min(max, value))}
      max={max}
      data-tone={tone}
    />
  );
}
