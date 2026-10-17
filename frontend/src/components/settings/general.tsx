import type { Settings } from '../../lib/types';
import { Appearance } from './appearance';
import { NumberField } from '../number-field';
import { Select } from '../select';
import { Switch } from '../switch';
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
      <div className="settings-row">
        <div className="settings-row-label">
          <label htmlFor="settings-font">字号大小</label>
          <p id="settings-font-hint">仅影响会话内容的字号</p>
        </div>
        <div className="settings-number-control">
          <NumberField
            id="settings-font"
            label="字号大小"
            descriptionId="settings-font-hint"
            min={12}
            max={20}
            value={draft.fontSize}
            onChange={(fontSize) => onChange({ ...draft, fontSize })}
          />
          <span className="settings-unit">px</span>
        </div>
      </div>
      <div className="settings-row">
        <div className="settings-row-label">
          <label htmlFor="settings-detail">工作步骤展示</label>
          <p id="settings-detail-hint">选择希望看到多少工具调用细节</p>
        </div>
        <Select<Settings['chatDetail']>
          id="settings-detail"
          label="工作步骤展示"
          descriptionId="settings-detail-hint"
          variant="field"
          value={draft.chatDetail}
          onChange={(chatDetail) => onChange({ ...draft, chatDetail })}
          options={[
            { value: 'compact', label: '简洁' },
            { value: 'standard', label: '标准' },
            { value: 'detailed', label: '详细' },
            { value: 'verbose', label: '完全展开' },
          ]}
        />
      </div>
      <div className="settings-row">
        <div className="settings-row-label">
          <label htmlFor="settings-sync">闲置同步间隔</label>
          <p id="settings-sync-hint">
            工作中的会话会加快同步，更新已保存的消息和工具结果
          </p>
        </div>
        <Select
          id="settings-sync"
          label="闲置同步间隔"
          descriptionId="settings-sync-hint"
          variant="field"
          value={String(draft.syncSeconds)}
          onChange={(value) =>
            onChange({
              ...draft,
              syncSeconds: Number(value),
            })
          }
          options={[...new Set([3, 5, 10, 30, 60, draft.syncSeconds])]
            .sort((a, b) => a - b)
            .map((seconds) => ({
              value: String(seconds),
              label: `每 ${seconds} 秒`,
            }))}
        />
      </div>
      <div className="settings-row">
        <div className="settings-row-label">
          <label htmlFor="settings-motion">界面过渡动画</label>
          <p id="settings-motion-hint">
            展开、收起时使用短过渡，遵循系统减少动态效果设置
          </p>
        </div>
        <Switch
          id="settings-motion"
          label="界面过渡动画"
          descriptionId="settings-motion-hint"
          checked={draft.animations}
          onChange={(animations) => onChange({ ...draft, animations })}
        />
      </div>
    </section>
  );
}
