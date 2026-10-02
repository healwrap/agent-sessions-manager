// Adapted from DeepSeek Harness JsonTree (MIT); see frontend/public/harness-license.txt.
import clsx from 'clsx';
import {
  useId,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { JsonString } from './json-string';
import {
  fieldText,
  pathId,
  isExpandableValue,
  entriesOf,
  primitiveValue,
  bracketOf,
  previewValue,
  claimFocus,
  moveFocus,
} from './model';
import type {
  JsonTreeLabels,
  JsonTreeProps,
  JsonPath,
  RowTarget,
} from './types';
import css from './classes';
function NodeField({
  field,
  expandable,
  onToggle,
}: {
  field: string | undefined;
  expandable: boolean;
  onToggle: () => void;
}) {
  if (field === undefined) return null;
  return (
    <span
      className={clsx(css.label, expandable && css.clickableLabel)}
      onClick={expandable ? onToggle : undefined}
    >
      {fieldText(field)}:
    </span>
  );
}

interface JsonTreeNodeProps {
  collapsedStringLines: number;
  stringWrapping: JsonTreeProps['stringWrapping'];
  field?: string;
  initialExpanded: boolean;
  labels: JsonTreeLabels;
  lastElement: boolean;
  onClaimTabStop: (id: string) => void;
  onRowHover: (row: HTMLElement, target: RowTarget) => void;
  path: JsonPath;
  renderCopy:
    ((target: RowTarget, persistent?: boolean) => ReactNode) | undefined;
  tabStopId: string | null;
  value: unknown;
}

export function JsonTreeNode({
  collapsedStringLines,
  stringWrapping,
  field,
  initialExpanded,
  labels,
  lastElement,
  onClaimTabStop,
  onRowHover,
  path,
  renderCopy,
  tabStopId,
  value,
}: JsonTreeNodeProps) {
  const contentsId = useId();
  const expanderRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(initialExpanded);
  const nodeId = pathId(path);
  const container = isExpandableValue(value);
  const entries = container ? entriesOf(value) : [];
  const expandable = entries.length > 0;

  const toggle = () => {
    setExpanded((current) => !current);
    claimFocus(expanderRef.current as HTMLSpanElement);
  };

  const onExpanderKeyDown = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      setExpanded(event.key === 'ArrowRight');
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(event.currentTarget, event.key === 'ArrowUp' ? -1 : 1);
    }
  };

  const row = (children: ReactNode, ariaExpanded?: boolean) => (
    <div
      className={css.row}
      role="treeitem"
      aria-expanded={ariaExpanded}
      onMouseOver={(event) => {
        event.stopPropagation();
        onRowHover(event.currentTarget, { path, value });
      }}
    >
      {typeof value !== 'string' && renderCopy?.({ path, value })}
      {children}
    </div>
  );

  if (typeof value === 'string') {
    return row(
      <JsonString
        collapsedStringLines={collapsedStringLines}
        stringWrapping={stringWrapping}
        field={field}
        value={value}
        labels={labels}
        lastElement={lastElement}
        renderCopy={
          renderCopy === undefined
            ? undefined
            : (persistent) => renderCopy({ path, value }, persistent)
        }
      />,
    );
  }

  if (!container) {
    return row(
      <>
        <NodeField field={field} expandable={false} onToggle={toggle} />
        {primitiveValue(value)}
        {!lastElement && <span className={css.punctuation}>,</span>}
      </>,
    );
  }

  const [open, close] = bracketOf(value);
  if (!expandable) {
    return row(
      <>
        <NodeField field={field} expandable={false} onToggle={toggle} />
        <span className={css.punctuation}>{open}</span>
        <span className={css.punctuation}>{close}</span>
        {!lastElement && <span className={css.punctuation}>,</span>}
      </>,
    );
  }

  return row(
    <>
      <span
        ref={expanderRef}
        className={clsx(
          css.expander,
          expanded ? css.collapseIcon : css.expandIcon,
        )}
        data-json-expander
        role="button"
        aria-label={expanded ? labels.collapseNode : labels.expandNode}
        aria-expanded={expanded}
        aria-controls={expanded ? contentsId : undefined}
        tabIndex={tabStopId === nodeId ? 0 : -1}
        onFocus={() => {
          onClaimTabStop(nodeId);
        }}
        onClick={toggle}
        onKeyDown={onExpanderKeyDown}
      />
      <span className={css.summary}>
        <NodeField field={field} expandable onToggle={toggle} />
        <span className={css.preview}>{previewValue(value, 0)}</span>
        {!lastElement && <span className={css.punctuation}>,</span>}
      </span>
      {expanded && (
        <ul id={contentsId} role="group" className={css.children}>
          {entries.map(([key, item], index) => (
            <JsonTreeNode
              key={key}
              collapsedStringLines={collapsedStringLines}
              stringWrapping={stringWrapping}
              field={key}
              value={item}
              path={[...path, Array.isArray(value) ? index : key]}
              labels={labels}
              lastElement={index === entries.length - 1}
              initialExpanded={false}
              tabStopId={tabStopId}
              onClaimTabStop={onClaimTabStop}
              onRowHover={onRowHover}
              renderCopy={renderCopy}
            />
          ))}
        </ul>
      )}
    </>,
    expanded,
  );
}
