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
      <SettingsRow
        label="字号大小"
        htmlFor="settings-font"
        description="仅影响会话内容的字号"
      >
        <input
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
      <SettingsRow
        label="工作步骤展示"
        htmlFor="settings-detail"
        description="选择希望看到多少工具调用细节"
      >
        <select
          id="settings-detail"
          value={draft.chatDetail}
          onChange={(event) =>
            onChange({
              ...draft,
              chatDetail: event.target.value as Settings['chatDetail'],
            })
          }
        >
          <option value="compact">简洁</option>
          <option value="standard">标准</option>
          <option value="detailed">详细</option>
          <option value="verbose">全部</option>
        </select>
      </SettingsRow>
      <SettingsRow
        label="闲置同步间隔"
        htmlFor="settings-sync"
        description="工作中的会话会加快同步，更新已保存的消息和工具结果"
      >
        <select
          id="settings-sync"
          value={draft.syncSeconds}
          onChange={(event) =>
            onChange({
              ...draft,
              syncSeconds: Number(event.target.value),
            })
          }
        >
          {[3, 5, 10, 30, 60].map((seconds) => (
            <option key={seconds} value={seconds}>
              每 {seconds} 秒
            </option>
          ))}
        </select>
      </SettingsRow>
      <SettingsRow
        label="界面过渡动画"
        htmlFor="settings-motion"
        description="展开、收起时使用短过渡，遵循系统减少动态效果设置"
      >
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
