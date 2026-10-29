import { useRef, type ReactNode } from 'react';
import { useLayoutSlide } from '../hooks/use-layout-slide';
import { useSidebarResize } from '../hooks/use-sidebar-resize';
import { IconButton } from './primitives';
import { SettingsButton } from './ui/settings-button';
import { sessionStore } from '../state/session-store';
import { GuideButton } from './guide-button';

export function WorkspaceSidebar({
  label,
  title = 'Agent Sessions',
  closed,
  width,
  onResize,
  onCollapse,
  footer,
  children,
}: {
  label: string;
  title?: string;
  closed: boolean;
  width?: number;
  onResize: (width?: number) => void;
  onCollapse: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const resize = useSidebarResize(width, onResize);
  return (
    <div className="sidebar-slot" data-closed={closed}>
      <aside className="sidebar" aria-label={label} inert={closed}>
        <div className="titlebar" data-tauri-drag-region>
          <span className="traffic-lights">
            <i />
            <i />
            <i />
          </span>
          <IconButton icon="panel" label="收起侧边栏" onClick={onCollapse} />
        </div>
        <div className="brand-row">
          <span className="brand-name">{title}</span>
        </div>
        {children}
        <footer>
          <div className="workspace-sidebar-actions">
            {footer}
            <GuideButton />
            <SettingsButton
              onClick={() => sessionStore.update({ settingsOpen: true })}
            />
          </div>
        </footer>
      </aside>
      <div
        className="sidebar-resize-handle"
        role="separator"
        aria-label="调整侧边栏宽度"
        aria-orientation="vertical"
        aria-valuemin={180}
        aria-valuemax={520}
        title="拖动调整侧栏宽度，双击恢复默认"
        tabIndex={closed ? -1 : 0}
        {...resize}
      />
    </div>
  );
}

export function WorkspaceLayout({
  sidebar,
  closed,
  onExpand,
  animations,
  title,
  actions,
  children,
  className = '',
}: {
  sidebar: ReactNode;
  closed: boolean;
  onExpand: () => void;
  animations: boolean;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const main = useRef<HTMLElement>(null);
  useLayoutSlide(main, closed, animations);
  return (
    <div
      className={`application ${className}${closed ? ' sidebar-collapsed' : ''}`}
    >
      {sidebar}
      <main ref={main} className="main">
        <header className="main-header" data-tauri-drag-region>
          {closed && (
            <>
              <IconButton icon="panel" label="展开侧边栏" onClick={onExpand} />
            </>
          )}
          <div className="session-title" data-tauri-drag-region>
            {title}
          </div>
          <div className="header-actions">
            {actions}
            {closed && (
              <>
                <GuideButton />
                <SettingsButton
                  onClick={() => sessionStore.update({ settingsOpen: true })}
                />
              </>
            )}
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
