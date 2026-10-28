import type { Settings, SettingsResponse } from '../../lib/types';
import { NumberField, SectionHeading, Select } from '../ui';
import { SettingsRow } from './row';
import { SourceSettings } from './sources';

export function SessionSettings({
  draft,
  data,
  onChange,
}: {
  draft: Settings;
  data: SettingsResponse | null;
  onChange: (value: Settings) => void;
}) {
  return (
    <section aria-label="会话管理设置">
      <SettingsRow label="会话字号" htmlFor="settings-font">
        <NumberField
          id="settings-font"
          label="会话字号"
          min={12}
          max={20}
          value={draft.fontSize}
          onChange={(fontSize) => onChange({ ...draft, fontSize })}
        />
        <span>px</span>
      </SettingsRow>
      <SettingsRow label="工作步骤展示" htmlFor="settings-detail">
        <Select
          id="settings-detail"
          label="工作步骤展示"
          variant="field"
          value={draft.chatDetail}
          onChange={(chatDetail) => onChange({ ...draft, chatDetail })}
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
          variant="field"
          value={String(draft.syncSeconds)}
          onChange={(value) =>
            onChange({ ...draft, syncSeconds: Number(value) })
          }
          options={[...new Set([3, 5, 10, 30, 60, draft.syncSeconds])]
            .sort((a, b) => a - b)
            .map((seconds) => ({
              value: String(seconds),
              label: `每 ${seconds} 秒`,
            }))}
        />
      </SettingsRow>
      <div className="settings-sources-group">
        <SectionHeading title="会话来源" level={3} />
        <SourceSettings draft={draft} data={data} onChange={onChange} />
      </div>
    </section>
  );
}
