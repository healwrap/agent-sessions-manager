import { useRef } from 'react';
import { sessionStore, type AppState } from '../state/session-store';
import { usePaneResize } from './use-pane-resize';

export function useDetailResize(state: AppState) {
  const drag = useRef({ width: 0, offset: 0 });
  return usePaneResize({
    edge: 'left',
    width: state.detailWidth ?? state.preferences.detailWidth,
    min: 320,
    max: (pane) =>
      Math.max(
        180,
        Math.min(
          720,
          pane.closest('.split')!.getBoundingClientRect().width - 280,
        ),
      ),
    property: '--detail-width',
    target: (pane) => pane.parentElement!,
    onStart: (pane) => {
      const splitWidth = pane.closest('.split')!.getBoundingClientRect().width;
      const defaultToolWidth = Math.min(
        480,
        Math.max(180, splitWidth * 0.36 - 56),
      );
      drag.current = {
        width: pane.getBoundingClientRect().width,
        offset: state.toolRequestOffset ?? splitWidth * 0.58 - defaultToolWidth,
      };
    },
    onMove: (width, pane) => {
      if (!drag.current.width) return;
      const offset = drag.current.offset + (width - drag.current.width) * 0.58;
      pane
        .closest<HTMLElement>('.split')!
        .style.setProperty(
          '--trajectory-tool-request-width',
          `calc(58cqw - ${offset}px)`,
        );
    },
    onReset: (pane) => {
      drag.current.width = 0;
      pane
        .closest<HTMLElement>('.split')!
        .style.removeProperty('--trajectory-tool-request-width');
    },
    onCommit: (width) => {
      const offset =
        width == null
          ? null
          : drag.current.offset + (width - drag.current.width) * 0.58;
      sessionStore.update({
        detailWidth: width == null ? null : Math.max(320, width),
        toolRequestOffset: offset,
      });
      const { detailWidth: _, ...preferences } = sessionStore.state.preferences;
      void sessionStore.savePreferences(
        width == null
          ? preferences
          : { ...preferences, detailWidth: Math.max(320, width) },
      );
      drag.current.width = 0;
    },
  });
}
