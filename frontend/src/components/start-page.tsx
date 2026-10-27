import { ArrowRight, PanelsTopLeft } from 'lucide-react';
import type { WorkspacePage } from '../workspace';
import { LeadingIcon } from './ui';
import { workspaceChoices } from './workspace-picker';

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
      </header>
      <main className="start-content">
        <h1>选择工作区</h1>
        <nav className="workspace-choices" aria-label="选择功能">
          {workspaceChoices.map((item) => (
            <button
              className="workspace-choice"
              key={item.value}
              onClick={() => onNavigate(item.value)}
            >
              <LeadingIcon>{item.icon}</LeadingIcon>
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
