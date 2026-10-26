import { ArrowLeft, PanelsTopLeft } from 'lucide-react';

export function WorkspaceHeader({
  title,
  onHome,
}: {
  title?: string;
  onHome?: () => void;
}) {
  return (
    <header className="workspace-header-bar" data-tauri-drag-region>
      {onHome ? (
        <button type="button" className="workspace-back" onClick={onHome}>
          <ArrowLeft size={16} aria-hidden="true" />
          返回开始页
        </button>
      ) : (
        <span className="workspace-brand" data-tauri-drag-region>
          <PanelsTopLeft size={18} aria-hidden="true" />
          Agent Sessions
        </span>
      )}
      {title && <span className="workspace-header-title">{title}</span>}
    </header>
  );
}
