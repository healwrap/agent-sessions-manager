import { useEffect, useState } from 'react';
import { GeneralSettings } from './settings/general';
import { SourceSettings } from './settings/sources';
import { useSettingsAutosave } from '../hooks/use-settings-autosave';
import { Button, Dialog, Icon, IconButton } from './primitives';
export function SettingsDialog({ open }: { open: boolean }) {
  const [section, setSection] = useState('general');
  const { data, draft, error, status, change, close, flush } =
    useSettingsAutosave(open);
  useEffect(() => {
    if (open) setSection('general');
  }, [open]);
  return (
    <Dialog open={open} onClose={close} id="settings-dialog" title="设置">
      <form
        id="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void flush();
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
              <span
                className="settings-save-status"
                data-state={status}
                role="status"
                aria-live="polite"
              >
                {status === 'saving'
                  ? '正在保存…'
                  : status === 'waiting'
                    ? '等待自动保存…'
                    : status === 'saved'
                      ? '已自动保存'
                      : status === 'error'
                        ? '尚未保存'
                        : '修改后自动保存'}
              </span>
            </div>
          </footer>
        </div>
      </form>
    </Dialog>
  );
}
