import type { Settings, SettingsResponse } from '../../lib/types';
import { AgentIcon } from '../agent-icon';
import { Switch } from '../switch';

export function SourceSettings({
  draft,
  data,
  onChange,
}: {
  draft: Settings;
  data: SettingsResponse | null;
  onChange: (value: Settings, commit?: boolean) => void;
}) {
  return (
    <section aria-label="会话来源">
      <p className="settings-description">
        读取各 Agent 的本地会话。开关即时生效，路径在结束编辑后自动保存。
      </p>
      {data?.sources.map((source) => {
        const paths = source.paths || [
          { key: source.id, label: '会话目录', hint: '' },
        ];
        const main = paths[0];
        const changed = draft.paths[main.key] !== data.value.paths[main.key];
        const input = (key: string) => (
          <input
            id={'path-' + key}
            type="text"
            value={draft.paths[key] || ''}
            onChange={(event) =>
              onChange(
                {
                  ...draft,
                  paths: { ...draft.paths, [key]: event.target.value },
                },
                false,
              )
            }
            onBlur={() =>
              draft.paths[key] !== data.value.paths[key] && onChange(draft)
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
        );
        return (
          <div className="settings-source" key={source.id}>
            <div className="settings-source-heading">
              <label htmlFor={'path-' + main.key}>
                <AgentIcon source={source.id} />
                {source.label}
              </label>
              <Switch
                label={'启用 ' + source.label}
                checked={draft.enabled[source.id] !== false}
                onChange={(checked) =>
                  onChange({
                    ...draft,
                    enabled: {
                      ...draft.enabled,
                      ...Object.fromEntries(
                        paths.map((path) => [path.key, checked]),
                      ),
                    },
                  })
                }
              />
            </div>
            {input(main.key)}
            <p className="settings-path-status">
              {changed
                ? '结束编辑后检查路径'
                : source.error ||
                  (!source.enabled
                    ? '已停用'
                    : source.available
                      ? '目录可用'
                      : '目录不存在')}
              {main.hint && ' · ' + main.hint}
            </p>
            {paths.slice(1).map((path) => (
              <details key={path.key}>
                <summary className="settings-path-status">{path.label}</summary>
                <label
                  htmlFor={'path-' + path.key}
                  className="settings-path-status"
                >
                  {path.hint}
                </label>
                {input(path.key)}
              </details>
            ))}
          </div>
        );
      })}
    </section>
  );
}
