import { useEffect, useState } from 'react';
import type { Settings, SettingsResponse } from '../lib/types';
import { sourceNames } from '../lib/types';
import { sessionStore } from '../state/session-store';
import { Dialog, Icon, IconButton } from './primitives';
export function SettingsDialog({ open }: { open: boolean }) {
  const [data, setData] = useState<SettingsResponse | null>(null),
    [draft, setDraft] = useState<Settings | null>(null),
    [section, setSection] = useState('general'),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setSection('general');
    setError('');
    void sessionStore
      .api<SettingsResponse>('/api/settings')
      .then((value) => {
        if (current) {
          setData(value);
          setDraft(structuredClone(value.value));
        }
      })
      .catch((e) => current && setError(String(e)));
    return () => {
      current = false;
    };
  }, [open]);
  const close = () => sessionStore.update({ settingsOpen: false });
  return (
    <Dialog open={open} onClose={close} id="settings-dialog" title="设置">
      <form
        id="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft) return;
          setSaving(true);
          setError('');
          void sessionStore
            .saveSettings(draft)
            .catch((e) => setError(String(e)))
            .finally(() => setSaving(false));
        }}
      >
        <nav className="settings-nav" aria-label="设置分类">
          <h2>设置</h2>
          <div className="settings-nav-list">
            {[
              ['general', 'settings', '通用设置'],
              ['sources', 'folder', '会话来源'],
            ].map(([key, icon, label]) => (
              <button
                key={key}
                type="button"
                aria-current={section === key}
                onClick={() => setSection(key)}
              >
                <Icon name={icon} />
                {label}
              </button>
            ))}
          </div>
        </nav>
        <div className="settings-content">
          <header className="settings-header">
            <IconButton icon="close" label="关闭设置" onClick={close} />
          </header>
          <div className="settings-options">
            {!draft && <p>正在读取设置…</p>}
            {draft && (
              <>
                <section hidden={section !== 'general'} aria-label="通用设置">
                  <div className="settings-row">
                    <div className="settings-row-label">
                      <label htmlFor="settings-sync">自动刷新</label>
                      <p>检查当前会话与项目列表的更新</p>
                    </div>
                    <select
                      id="settings-sync"
                      value={draft.syncSeconds}
                      onChange={(event) =>
                        setDraft({
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
                        setDraft({ ...draft, animations: event.target.checked })
                      }
                    />
                  </div>
                </section>
                <section hidden={section !== 'sources'} aria-label="会话来源">
                  <p className="settings-description">
                    读取各 Agent 的本地会话，保存后生效。
                  </p>
                  {Object.keys(sourceNames).map((key) => {
                    const source = data?.sources.find(
                        (item) => item.id === key,
                      ),
                      changed = draft.paths[key] !== data?.value.paths[key];
                    return (
                      <div className="settings-source" key={key}>
                        <div className="settings-source-heading">
                          <label htmlFor={'path-' + key}>
                            {sourceNames[key]}
                          </label>
                          <input
                            type="checkbox"
                            role="switch"
                            className="settings-switch"
                            aria-label={'启用 ' + sourceNames[key]}
                            checked={draft.enabled[key] !== false}
                            onChange={(event) =>
                              setDraft({
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
                            setDraft({
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
                                  ? '目录可用'
                                  : '目录不存在')}
                          {key.startsWith('antigravity')
                            ? ' · 读取本地导出的记录'
                            : key === 'claude:desktop'
                              ? ' · 桌面会话索引，正文从 CLI 目录读取'
                              : key === 'dsh:local'
                                ? ' · 支持 JSONL 与 Zstandard 压缩日志'
                                : ''}
                        </p>
                      </div>
                    );
                  })}
                </section>
              </>
            )}
          </div>
          <footer className="settings-footer">
            {error && (
              <p className="settings-error" role="alert">
                {error}
              </p>
            )}
            <div className="settings-actions">
              <button
                id="settings-defaults"
                type="button"
                disabled={!data}
                onClick={() => data && setDraft(structuredClone(data.defaults))}
              >
                恢复默认
              </button>
              <button type="button" onClick={close}>
                取消
              </button>
              <button id="settings-save" disabled={!draft || saving}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </footer>
        </div>
      </form>
    </Dialog>
  );
}
