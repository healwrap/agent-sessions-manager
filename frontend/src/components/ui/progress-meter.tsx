export function ProgressMeter({
  label,
  value,
  max = 100,
}: {
  label: string;
  value: number;
  max?: number;
}) {
  const tone =
    value >= max ? 'error' : value >= max * 0.8 ? 'warning' : 'normal';
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
