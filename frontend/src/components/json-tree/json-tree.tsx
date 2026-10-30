// Adapted from DeepSeek Harness JsonTree (MIT); see frontend/public/harness-license.txt.
import clsx from 'clsx';
import { copyText as writeClipboard } from '../../lib/api';
import { sessionStore } from '../../state/session-store';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createCopyStore } from './copy-store';
import { JsonCopyAction } from './copy-action';
import { JsonTreeNode } from './json-node';
import {
  entriesOf,
  isExpandableValue,
  pathId,
  copyText,
  bracketOf,
} from './model';
import type { JsonTreeProps, RowTarget, CopyMode, CopySnapshot } from './types';
import css from './classes';
/**
 * Render parsed JSON as a compact, keyboard-accessible inspector tree.
 * @param props - Parsed data, accessible label, and display options.
 * @returns A read-only JSON tree with an optionally fixed-open top level.
 */
export function JsonTree({
  data,
  label,
  className,
  collapsedStringLines = 3,
  stringWrapping,
  copyable = true,
  expandTopLevel = true,
  labels,
}: JsonTreeProps) {
  const rootEntries = entriesOf(data);
  const firstExpandableIndex = rootEntries.findIndex(
    ([, value]) => isExpandableValue(value) && entriesOf(value).length > 0,
  );
  const firstExpandableEntry = rootEntries[firstExpandableIndex];
  const initialTabStopId = expandTopLevel
    ? firstExpandableEntry === undefined
      ? null
      : pathId([
          Array.isArray(data) ? firstExpandableIndex : firstExpandableEntry[0],
        ])
    : isExpandableValue(data) && rootEntries.length > 0
      ? pathId([])
      : null;
  const activeRowRef = useRef<HTMLElement | undefined>(undefined);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const copySequence = useRef(0);
  const [copyStore] = useState(createCopyStore);
  const [tabStopId, setTabStopId] = useState<string | null>(initialTabStopId);

  const setActiveRow = (row: HTMLElement | undefined) => {
    activeRowRef.current?.removeAttribute('data-json-copy-active');
    activeRowRef.current = row;
    row?.setAttribute('data-json-copy-active', '');
  };

  const clearCopyTarget = () => {
    copySequence.current += 1;
    if (resetTimer.current !== undefined) clearTimeout(resetTimer.current);
    setActiveRow(undefined);
    copyStore.set(undefined);
  };

  useEffect(
    () => () => {
      copySequence.current += 1;
      if (resetTimer.current !== undefined) clearTimeout(resetTimer.current);
      activeRowRef.current?.removeAttribute('data-json-copy-active');
    },
    [],
  );

  useEffect(() => {
    clearCopyTarget();
    setTabStopId(initialTabStopId);
  }, [data, expandTopLevel, initialTabStopId]);

  const handleRowHover = (row: HTMLElement, target: RowTarget) => {
    if (!copyable || copyStore.get()?.menuOpen) return;
    if (activeRowRef.current === row) return;
    setActiveRow(row);
    copyStore.set({
      id: pathId(target.path),
      target,
      state: 'idle',
      menuOpen: false,
    });
  };

  const handleRootMouseOver = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!copyable || copyStore.get()?.menuOpen) return;
    /* v8 ignore next -- browser mouse events delivered through React target an Element. */
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-json-copy-button]') === null)
      clearCopyTarget();
  };

  const copy = async (target: RowTarget, mode: CopyMode) => {
    const sequence = ++copySequence.current;
    const snapshot: CopySnapshot = {
      id: pathId(target.path),
      target,
      state: 'idle',
      menuOpen: false,
    };
    copyStore.set(snapshot);
    let state: CopySnapshot['state'];
    try {
      await writeClipboard(copyText(target, mode));
      state = 'copied';
      sessionStore.notify('已复制 JSON 内容。', { tone: 'success' });
    } catch (reason) {
      state = 'failed';
      sessionStore.notify(String(reason), { tone: 'error' });
    }
    const current = copyStore.get();
    if (sequence !== copySequence.current || current?.target !== target) return;
    copyStore.set({ ...current, state });
    if (resetTimer.current !== undefined) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      const current = copyStore.get();
      if (current?.target === target)
        copyStore.set({ ...current, state: 'idle' });
    }, 1_500);
  };

  const [rootOpen, rootClose] = bracketOf(data);
  const renderCopy = copyable
    ? (target: RowTarget, persistent = false) => (
        <JsonCopyAction
          store={copyStore}
          target={target}
          persistent={persistent}
          labels={labels}
          onCopy={copy}
          onClose={clearCopyTarget}
        />
      )
    : undefined;

  return (
    <div
      className={clsx(css.root, className)}
      style={
        { '--json-tree-collapsed-lines': collapsedStringLines } as CSSProperties
      }
      onMouseOver={handleRootMouseOver}
      onMouseLeave={() => {
        if (!copyStore.get()?.menuOpen) clearCopyTarget();
      }}
    >
      {expandTopLevel ? (
        <div className={css.expandedTopLevel}>
          <div
            className={clsx(css.row, css.topLevelBracket)}
            data-json-root-row
            onMouseOver={(event) => {
              event.stopPropagation();
              handleRowHover(event.currentTarget, { path: [], value: data });
            }}
          >
            {renderCopy?.({ path: [], value: data })}
            <span className={css.punctuation}>{rootOpen}</span>
          </div>
          <div
            aria-label={label}
            className={clsx(css.container, css.expandedTopLevelContainer)}
            role="tree"
          >
            {rootEntries.map(([key, value], index) => (
              <JsonTreeNode
                key={key}
                collapsedStringLines={collapsedStringLines}
                stringWrapping={stringWrapping}
                field={key}
                value={value}
                path={[Array.isArray(data) ? index : key]}
                labels={labels}
                lastElement={index === rootEntries.length - 1}
                initialExpanded={false}
                tabStopId={tabStopId}
                onClaimTabStop={setTabStopId}
                onRowHover={handleRowHover}
                renderCopy={renderCopy}
              />
            ))}
          </div>
          <div className={clsx(css.row, css.topLevelBracket)}>
            <span className={css.punctuation}>{rootClose}</span>
          </div>
        </div>
      ) : (
        <div aria-label={label} className={css.container} role="tree">
          <JsonTreeNode
            collapsedStringLines={collapsedStringLines}
            stringWrapping={stringWrapping}
            value={data}
            path={[]}
            labels={labels}
            lastElement
            initialExpanded
            tabStopId={tabStopId}
            onClaimTabStop={setTabStopId}
            onRowHover={handleRowHover}
            renderCopy={renderCopy}
          />
        </div>
      )}
    </div>
  );
}
