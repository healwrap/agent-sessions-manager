import { usePaneResize } from './use-pane-resize';

export function useSidebarResize(
  width: number | undefined,
  onWidthChange: (width?: number) => void,
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
