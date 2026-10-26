import { sessionStore } from '../state/session-store';
import { usePaneResize } from './use-pane-resize';

export function useSidebarResize(
  width: number | undefined,
  onWidthChange: (width?: number) => void = (next) => {
    const { sidebarWidth: _, ...preferences } = sessionStore.state.preferences;
    void sessionStore.savePreferences(
      next == null ? preferences : { ...preferences, sidebarWidth: next },
    );
  },
) {
  return usePaneResize({
    edge: 'right',
    width,
    min: 180,
    max: () => Math.max(180, Math.min(520, window.innerWidth - 360)),
    property: '--sidebar-user-width',
    onCommit: onWidthChange,
  });
}
