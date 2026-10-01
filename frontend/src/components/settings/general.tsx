import type { Settings } from '../../lib/types';
import { Appearance } from './appearance';
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
          <label htmlFor="settings-sync">自动刷新</label>
          <p>检查当前会话与项目列表的更新</p>
        </div>
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
      </div>
      <div className="settings-row">
        <div className="settings-row-label">
          <label htmlFor="settings-motion">界面过渡动画</label>
          <p>展开、收起时使用短过渡，遵循系统减少动态效果设置</p>
        </div>
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
      </div>
    </section>
  );
}
