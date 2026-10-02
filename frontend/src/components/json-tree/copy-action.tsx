// Adapted from DeepSeek Harness JsonTree (MIT); see frontend/public/harness-license.txt.
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { Icon } from '../primitives';
import { CopyMenu, type CopyMenuItem } from './copy-menu';
import { createCopyStore } from './copy-store';
import { pathId } from './model';
import type { RowTarget, CopyMode, JsonTreeLabels } from './types';
import css from './classes';
function valueCopyMenuItems(labels: JsonTreeLabels): readonly CopyMenuItem[] {
  return [
    { id: 'value', label: labels.copyValue },
    { id: 'json', label: labels.copyJson },
    { id: 'path', label: labels.copyPath },
  ];
}

function objectCopyMenuItems(labels: JsonTreeLabels): readonly CopyMenuItem[] {
  return [
    { id: 'prettyJson', label: labels.copyPrettyJson },
    { id: 'json', label: labels.copyCompactJson },
    { id: 'path', label: labels.copyPath },
  ];
}

export function JsonCopyAction({
  store,
  target,
  persistent,
  labels,
  onCopy,
  onClose,
}: {
  store: ReturnType<typeof createCopyStore>;
  target: RowTarget;
  persistent: boolean;
  labels: JsonTreeLabels;
  onCopy: (target: RowTarget, mode: CopyMode) => Promise<void>;
  onClose: () => void;
}) {
  const id = pathId(target.path);
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(id, listener),
    [id, store],
  );
  const getSnapshot = () => {
    const current = store.get();
    return current?.id === id ? current : undefined;
  };
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const state = snapshot?.state ?? 'idle';
  const object = typeof target.value === 'object' && target.value !== null;
  const copyTitle =
    state === 'copied'
      ? labels.copied
      : state === 'failed'
        ? labels.copyFailed
        : object
          ? labels.copyPrettyJson
          : labels.copyValue;
  return (
    <span className={css.copySlot}>
      {(persistent || snapshot !== undefined) && (
        <CopyMenu
          open={snapshot?.menuOpen === true}
          anchor={
            <button
              ref={buttonRef}
              type="button"
              className={css.actionButton}
              data-json-copy-button
              data-state={state}
              aria-label={copyTitle}
              title={labels.copyButtonTitle(copyTitle)}
              onClick={() =>
                void onCopy(target, object ? 'prettyJson' : 'value')
              }
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                store.set({ id, target, state, menuOpen: true });
              }}
            >
              {state === 'copied' ? (
                <Icon name="check" />
              ) : (
                <Icon name="copy" />
              )}
            </button>
          }
          items={
            object ? objectCopyMenuItems(labels) : valueCopyMenuItems(labels)
          }
          onSelect={(mode) => {
            void onCopy(target, mode as CopyMode);
          }}
          onClose={onClose}
          getAnchorRect={() =>
            (buttonRef.current as HTMLButtonElement).getBoundingClientRect()
          }
        />
      )}
    </span>
  );
}
