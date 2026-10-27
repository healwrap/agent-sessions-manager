import type { Settings } from '../../lib/types';
import { Appearance } from './appearance';
import { SettingsRow } from './row';
export function GeneralSettings({
  draft,
  onChange,
}: {
  draft: Settings;
  onChange: (value: Settings) => void;
}) {
  return (
    <section aria-label="通用设置">
      <Appearance
        value={draft.theme}
        onChange={(theme) => onChange({ ...draft, theme })}
      />
      <SettingsRow label="界面过渡动画" htmlFor="settings-motion">
        <input
          id="settings-motion"
          className="settings-switch"
          type="checkbox"
          role="switch"
          checked={draft.animations}
          onChange={(event) =>
            onChange({ ...draft, animations: event.target.checked })
          }
        />
      </SettingsRow>
    </section>
  );
}
