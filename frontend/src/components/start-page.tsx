import {
  ArrowRight,
  MessagesSquare,
  PanelsTopLeft,
  UsersRound,
} from 'lucide-react';
import type { WorkspacePage } from '../workspace';
import { Button } from './primitives';

export function StartPage({
  onNavigate,
}: {
  onNavigate: (page: WorkspacePage) => void;
}) {
  return (
    <div className="workspace-page start-page">
      <header className="workspace-header-bar" data-tauri-drag-region>
        <span className="workspace-brand" data-tauri-drag-region>
          <PanelsTopLeft size={18} aria-hidden="true" />
          Agent Sessions
        </span>
      </header>
      <main className="start-content">
        <h1>选择工作区</h1>
        <nav className="workspace-choices" aria-label="选择功能">
          <Button
            variant="text"
            className="workspace-choice"
            onClick={() => onNavigate('sessions')}
          >
            <MessagesSquare size={22} strokeWidth={1.7} aria-hidden="true" />
            <span>会话管理</span>
            <ArrowRight
              size={18}
              className="workspace-choice-arrow"
              aria-hidden="true"
            />
          </Button>
          <Button
            variant="text"
            className="workspace-choice"
            onClick={() => onNavigate('accounts')}
          >
            <UsersRound size={22} strokeWidth={1.7} aria-hidden="true" />
            <span>账号与环境管理</span>
            <ArrowRight
              size={18}
              className="workspace-choice-arrow"
              aria-hidden="true"
            />
          </Button>
        </nav>
      </main>
    </div>
  );
}
