import { useEffect, useState } from 'react';
import type { Settings, SettingsResponse } from '../lib/types';
import { GeneralSettings } from './settings/general';
import { SourceSettings } from './settings/sources';
import { sessionStore } from '../state/session-store';
import { Button, Dialog, Icon, IconButton } from './primitives';
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
  const change = (value: Settings) => {
    setDraft(value);
    if (value.theme !== draft?.theme)
      sessionStore.update({ themePreview: value.theme });
  };
  const close = () =>
    sessionStore.update({ settingsOpen: false, themePreview: null });
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
                <div hidden={section !== 'general'}>
                  <GeneralSettings draft={draft} onChange={change} />
                </div>
                <div hidden={section !== 'sources'}>
                  <SourceSettings draft={draft} data={data} onChange={change} />
                </div>
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
              <Button
                id="settings-defaults"
                type="button"
                disabled={!data}
                onClick={() => data && change(structuredClone(data.defaults))}
              >
                恢复默认
              </Button>
              <Button onClick={close}>取消</Button>
              <Button
                id="settings-save"
                type="submit"
                variant="primary"
                disabled={!draft || saving}
              >
                {saving ? '保存中…' : '保存'}
              </Button>
            </div>
          </footer>
        </div>
      </form>
    </Dialog>
  );
}
