import { useEffect, useState } from 'react';
import { GeneralSettings } from './settings/general';
import { SessionSettings } from './settings/sessions';
import { useSettingsAutosave } from '../hooks/use-settings-autosave';
import { Dialog, Icon } from './primitives';
import { Button, BusyState, IconButton, Notice, SectionHeading } from './ui';
export function SettingsDialog({ open }: { open: boolean }) {
  const [section, setSection] = useState('general');
  const { data, draft, error, status, change, close, flush } =
    useSettingsAutosave(open);
  useEffect(() => {
    if (open) setSection('general');
  }, [open]);
  return (
    <Dialog
      open={open}
      onClose={close}
      id="settings-dialog"
      title="设置"
      className="ui-settings"
    >
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
              ['general', 'settings', '通用'],
              ['sessions', 'context', '会话管理'],
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
            {!draft && <BusyState label="正在读取设置" />}
            {draft && (
              <>
                <SectionHeading
                  title={section === 'general' ? '通用' : '会话管理'}
                />
                <div hidden={section !== 'general'}>
                  <GeneralSettings draft={draft} onChange={change} />
                </div>
                <div hidden={section !== 'sessions'}>
                  <SessionSettings
                    draft={draft}
                    data={data}
                    onChange={change}
                  />
                </div>
              </>
            )}
          </div>
          <footer className="settings-footer">
            {error && <Notice tone="error">{error}</Notice>}
            <div className="settings-actions">
              <Button
                id="settings-defaults"
                type="button"
                disabled={!data}
                onClick={() => {
                  if (!data || !draft) return;
                  const defaults = structuredClone(data.defaults);
                  change(
                    section === 'general'
                      ? {
                          ...draft,
                          theme: defaults.theme,
                          animations: defaults.animations,
                        }
                      : {
                          ...draft,
                          fontSize: defaults.fontSize,
                          chatDetail: defaults.chatDetail,
                          syncSeconds: defaults.syncSeconds,
                          paths: defaults.paths,
                          enabled: defaults.enabled,
                        },
                  );
                }}
              >
                恢复本页默认
              </Button>
              <span
                className="settings-save-status"
                data-state={status}
                role="status"
                aria-live="polite"
              >
                {status === 'saving'
                  ? '保存中…'
                  : status === 'waiting'
                    ? '待保存'
                    : status === 'saved'
                      ? '已保存'
                      : status === 'error'
                        ? '尚未保存'
                        : ''}
              </span>
            </div>
          </footer>
        </div>
      </form>
    </Dialog>
  );
}
