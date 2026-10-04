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
          <label htmlFor="settings-font">字号大小</label>
          <p>仅影响会话内容的字号</p>
        </div>
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
      </div>
      <div className="settings-row">
        <div className="settings-row-label">
          <label htmlFor="settings-detail">工作步骤展示</label>
          <p>选择希望看到多少工具调用细节</p>
        </div>
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
      </div>
      <div className="settings-row">
        <div className="settings-row-label">
          <label htmlFor="settings-sync">闲置同步间隔</label>
          <p>工作中的会话会加快同步，更新已保存的消息和工具结果</p>
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
