import {
  sourceNames,
  type Settings,
  type SettingsResponse,
} from '../../lib/types';
export function SourceSettings({
  draft,
  data,
  onChange,
}: {
  draft: Settings;
  data: SettingsResponse | null;
  onChange: (value: Settings) => void;
}) {
  return (
    <section aria-label="会话来源">
      <p className="settings-description">
        读取各 Agent 的本地会话，保存后生效。
      </p>
      {Object.keys(sourceNames).map((key) => {
        const source = data?.sources.find((item) => item.id === key),
          changed = draft.paths[key] !== data?.value.paths[key];
        return (
          <div className="settings-source" key={key}>
            <div className="settings-source-heading">
              <label htmlFor={'path-' + key}>{sourceNames[key]}</label>
              <input
                type="checkbox"
                role="switch"
                className="settings-switch"
                aria-label={'启用 ' + sourceNames[key]}
                checked={draft.enabled[key] !== false}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    enabled: {
                      ...draft.enabled,
                      [key]: event.target.checked,
                    },
                  })
                }
              />
            </div>
            <input
              id={'path-' + key}
              type="text"
              value={draft.paths[key] || ''}
              onChange={(event) =>
                onChange({
                  ...draft,
                  paths: {
                    ...draft.paths,
                    [key]: event.target.value,
                  },
                })
              }
            />
            <p className="settings-path-status">
              {changed
                ? '保存后检查路径'
                : source?.error ||
                  (!source?.enabled
                    ? '已停用'
                    : source?.available
                      ? key === 'claude:desktop'
                        ? '本地会话来源可用'
                        : '目录可用'
                      : '目录不存在')}
              {key.startsWith('antigravity')
                ? ' · 读取本地导出的记录'
                : key === 'claude:desktop'
                  ? ' · 读取桌面索引或带桌面来源标记的共享正文'
                  : key === 'dsh:local'
                    ? ' · 支持 JSONL 与 Zstandard 压缩日志'
                    : ''}
            </p>
          </div>
        );
      })}
    </section>
  );
}
