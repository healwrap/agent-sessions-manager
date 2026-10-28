import type { Settings, SettingsResponse } from '../../lib/types';
import { AgentIcon } from '../agent-icon';
import { TextInput } from '../ui';

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
      {data?.sources.map((source) => {
        const paths = source.paths || [
          { key: source.id, label: '会话目录', hint: '' },
        ];
        const main = paths[0];
        const changed = draft.paths[main.key] !== data.value.paths[main.key];
        const input = (key: string) => (
          <TextInput
            id={'path-' + key}
            type="text"
            value={draft.paths[key] || ''}
            onChange={(event) =>
              onChange({
                ...draft,
                paths: { ...draft.paths, [key]: event.target.value },
              })
            }
          />
        );
        return (
          <div className="settings-source" key={source.id}>
            <div className="settings-source-heading">
              <label htmlFor={'path-' + main.key}>
                <AgentIcon source={source.id} />
                {source.label}
              </label>
              <input
                type="checkbox"
                role="switch"
                className="settings-switch"
                aria-label={'启用 ' + source.label}
                checked={draft.enabled[source.id] !== false}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    enabled: {
                      ...draft.enabled,
                      ...Object.fromEntries(
                        paths.map((path) => [path.key, event.target.checked]),
                      ),
                    },
                  })
                }
              />
            </div>
            {input(main.key)}
            <p className="settings-path-status">
              {changed
                ? '自动保存后检查路径'
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
