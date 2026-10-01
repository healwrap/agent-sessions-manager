import { Sun, Moon, Monitor } from 'lucide-react';
import type { ThemePreference } from '../../lib/types';
const choices = [
  ['light', '浅色', Sun],
  ['dark', '深色', Moon],
  ['system', '跟随系统', Monitor],
] as const;
export function Appearance({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}) {
  return (
    <div className="appearance-group flex flex-col gap-2  py-4">
      <span className="text-sm">外观</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label="外观">
        {choices.map(([key, label, Symbol]) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            className="appearance-card flex flex-1 flex-col items-center justify-center gap-1 rounded-[20px] border px-5 py-5 text-sm"
            onClick={() => onChange(key)}
          >
            <Symbol size={18} strokeWidth={1.6} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
