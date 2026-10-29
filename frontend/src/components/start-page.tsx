import { ArrowRight, PanelsTopLeft } from 'lucide-react';
import type { WorkspacePage } from '../workspace';
import { workspaceChoices } from './workspace-picker';
import { SettingsButton } from './ui';
import { sessionStore } from '../state/session-store';
import { GuideButton } from './guide-button';

export function StartPage({
  onNavigate,
}: {
  onNavigate: (page: WorkspacePage) => void;
}) {
  return (
    <div className="workspace-page start-page ui-page">
      <header className="workspace-header-bar" data-tauri-drag-region>
        <span className="workspace-brand" data-tauri-drag-region>
          <PanelsTopLeft size={18} aria-hidden="true" />
          Agent Sessions
        </span>
        <div className="header-actions">
          <GuideButton />
          <SettingsButton
            onClick={() => sessionStore.update({ settingsOpen: true })}
          />
        </div>
      </header>
      <main className="start-content">
        <h1>工作区</h1>
        <nav className="workspace-choices" aria-label="选择功能">
          {workspaceChoices.map((item) => (
            <button
              className="workspace-choice"
              key={item.value}
              onClick={() => onNavigate(item.value)}
            >
              <span className="workspace-choice-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
              <ArrowRight
                size={18}
                className="workspace-choice-arrow"
                aria-hidden="true"
              />
            </button>
          ))}
        </nav>
      </main>
    </div>
  );
}
