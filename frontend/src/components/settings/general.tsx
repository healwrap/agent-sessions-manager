import type { Settings } from '../../lib/types';
import { Appearance } from './appearance';
import { SettingsRow } from './row';
import { Select, TextInput } from '../ui';
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
      <SettingsRow
        label="字号大小"
        htmlFor="settings-font"
        description="仅影响会话内容的字号"
      >
        <TextInput
          id="settings-font"
          type="number"
          min={12}
          max={20}
          value={draft.fontSize}
          onChange={(event) =>
            onChange({ ...draft, fontSize: Number(event.target.value) })
          }
        />
        <span>px</span>
      </SettingsRow>
      <SettingsRow label="工作步骤展示" htmlFor="settings-detail">
        <Select
          id="settings-detail"
          label="工作步骤展示"
          value={draft.chatDetail}
          onChange={(value) =>
            onChange({ ...draft, chatDetail: value as Settings['chatDetail'] })
          }
          options={[
            { value: 'compact', label: '简洁' },
            { value: 'standard', label: '标准' },
            { value: 'detailed', label: '详细' },
            { value: 'verbose', label: '全部' },
          ]}
        />
      </SettingsRow>
      <SettingsRow label="闲置同步间隔" htmlFor="settings-sync">
        <Select
          id="settings-sync"
          label="闲置同步间隔"
          value={String(draft.syncSeconds)}
          onChange={(value) =>
            onChange({ ...draft, syncSeconds: Number(value) })
          }
          options={[3, 5, 10, 30, 60].map((seconds) => ({
            value: String(seconds),
            label: `每 ${seconds} 秒`,
          }))}
        />
      </SettingsRow>
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
