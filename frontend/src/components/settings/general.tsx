import type { Settings } from '../../lib/types';
import { Appearance } from './appearance';
import { SettingsRow } from './row';
import { Switch } from '../ui';
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
        <Switch
          id="settings-motion"
          label="界面过渡动画"
          checked={draft.animations}
          onChange={(animations) => onChange({ ...draft, animations })}
        />
      </SettingsRow>
    </section>
  );
}
