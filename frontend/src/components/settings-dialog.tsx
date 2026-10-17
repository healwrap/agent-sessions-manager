import { useEffect, useRef, useState } from 'react';
import type { Settings, SettingsResponse } from '../lib/types';
import { GeneralSettings } from './settings/general';
import { SourceSettings } from './settings/sources';
import { sessionStore } from '../state/session-store';
import { Dialog, Icon, IconButton } from './primitives';
export function SettingsDialog({ open }: { open: boolean }) {
  const [data, setData] = useState<SettingsResponse | null>(null),
    [draft, setDraft] = useState<Settings | null>(null),
    [section, setSection] = useState('general'),
    [error, setError] = useState('');
  const saves = useRef(Promise.resolve());
  const queued = useRef<Settings | null>(null);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setSection('general');
    setError('');
    setDraft(null);
    void saves.current
      .then(() => sessionStore.api<SettingsResponse>('/api/settings'))
      .then((value) => {
        if (current) {
          setData(value);
          setDraft(structuredClone(value.value));
          queued.current = value.value;
        }
      })
      .catch((e) => current && setError(String(e)));
    return () => {
      current = false;
    };
  }, [open]);
  const change = (value: Settings, commit = true) => {
    setDraft(value);
    if (value.theme !== draft?.theme)
      sessionStore.update({ themePreview: value.theme });
    if (!commit || JSON.stringify(value) === JSON.stringify(queued.current))
      return;
    queued.current = value;
    setError('');
    // Serialize whole-setting writes so rapid changes cannot overwrite each other.
    saves.current = saves.current
      .then(async () => {
        const saved = await sessionStore.saveSettings(value);
        setData((previous) => previous && { ...previous, ...saved });
        setDraft((previous) => (previous === value ? saved.value : previous));
        if (queued.current === value) queued.current = saved.value;
        setError('');
      })
      .catch((e) => {
        if (queued.current === value) queued.current = null;
        setError(String(e));
        sessionStore.notify('设置未能保存：' + String(e));
      });
  };
  const close = () => {
    if (draft && JSON.stringify(draft) !== JSON.stringify(queued.current))
      change(draft);
    sessionStore.update({ settingsOpen: false, themePreview: null });
  };
  return (
    <Dialog open={open} onClose={close} id="settings-dialog" title="设置">
      <form id="settings-form" onSubmit={(event) => event.preventDefault()}>
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
            {error && (
              <p className="settings-error" role="alert">
                {error}
              </p>
            )}
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
        </div>
      </form>
    </Dialog>
  );
}
