// Adapted from DeepSeek Harness JsonTree (MIT); see frontend/public/harness-license.txt.
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon } from '../primitives';
import { fieldText, primitiveValue } from './model';
import type { JsonTreeLabels, JsonTreeProps } from './types';
import css from './classes';
export function JsonString({
  collapsedStringLines,
  stringWrapping,
  field,
  labels,
  lastElement,
  renderCopy,
  value,
}: {
  collapsedStringLines: number;
  stringWrapping: JsonTreeProps['stringWrapping'];
  field: string | undefined;
  labels: JsonTreeLabels;
  lastElement: boolean;
  renderCopy: ((persistent?: boolean) => ReactNode) | undefined;
  value: string;
}) {
  const contentsId = useId();
  const contentRef = useRef<HTMLSpanElement>(null);
  const rawRef = useRef<HTMLPreElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    if (expanded) return;
    const content = contentRef.current as HTMLSpanElement;
    const measure = () => {
      const lineHeight = Number.parseFloat(
        getComputedStyle(content).lineHeight,
      );
      setTruncated(content.scrollHeight > lineHeight * collapsedStringLines);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, [collapsedStringLines, expanded, field, lastElement, value]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const raw = rawRef.current as HTMLPreElement;
    // Size from the containing viewport, not the moving text's screen position.
    // Changing maxHeight on every scroll shifts siblings and the scrollbar thumb.
    const clips: HTMLElement[] = [];
    const tree = raw.closest<HTMLElement>(`.${css.root}`) as HTMLElement;
    for (
      let parent = tree.parentElement;
      parent !== null;
      parent = parent.parentElement
    ) {
      if (/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY))
        clips.push(parent);
    }
    const measure = () => {
      let available = Math.min(400, window.innerHeight - 32);
      for (const clip of clips) {
        const style = getComputedStyle(clip);
        const limit = Number.parseFloat(style.maxHeight);
        // Intrinsic preview heights depend on this string; using them would
        // create a ResizeObserver feedback loop when expanding or wrapping it.
        const height = Number.isFinite(limit)
          ? limit
          : Number.parseFloat(style.flexGrow) > 0
            ? clip.clientHeight
            : Infinity;
        available = Math.min(
          available,
          height -
            Number.parseFloat(style.paddingTop) -
            Number.parseFloat(style.paddingBottom),
        );
      }
      const height = `${Math.max(16, available - 4)}px`;
      if (
        raw.style.getPropertyValue('--json-tree-measured-string-max-height') !==
        height
      )
        raw.style.setProperty('--json-tree-measured-string-max-height', height);
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure);
    for (const clip of clips) observer?.observe(clip);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [expanded, value]);

  if (expanded) {
    const fieldId = `${contentsId}-field`;
    return (
      <div className={css.stringField} data-expanded>
        {field !== undefined && (
          <span id={fieldId} className={css.label}>
            {fieldText(field)}:
          </span>
        )}
        <pre
          ref={rawRef}
          id={contentsId}
          className={css.stringRaw}
          data-wrap={wrapped}
          tabIndex={0}
          aria-labelledby={field === undefined ? undefined : fieldId}
        >
          {value}
        </pre>
        {!lastElement && <span className={css.punctuation}>,</span>}
        <div className={css.stringActions}>
          {stringWrapping !== undefined && (
            <button
              type="button"
              className={css.actionButton}
              aria-label={stringWrapping.label}
              data-tooltip={stringWrapping.label}
              aria-pressed={wrapped}
              aria-controls={contentsId}
              onClick={() => {
                const next = !wrapped;
                setWrapped(next);
                stringWrapping.setDefault(next);
              }}
            >
              <Icon name="wrap" />
            </button>
          )}
          <button
            type="button"
            className={css.actionButton}
            aria-label={labels.collapseNode}
            data-tooltip={labels.collapseNode}
            aria-expanded
            aria-controls={contentsId}
            onClick={() => {
              setExpanded(false);
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path d="M9.5 1.5V6.5H14.5M1.5 9.5H6.5V14.5" />
            </svg>
          </button>
          {renderCopy?.(true)}
        </div>
      </div>
    );
  }

  return (
    <>
      {renderCopy?.()}
      <span className={css.stringField} data-expanded={expanded}>
        <span ref={contentRef} id={contentsId} className={css.stringText}>
          {truncated && (
            <span className={css.stringToggleSlot}>
              <button
                type="button"
                className={css.stringToggle}
                aria-label={labels.expandNode}
                aria-expanded={false}
                aria-controls={contentsId}
                onClick={() => {
                  setWrapped(stringWrapping?.getDefault() ?? false);
                  setExpanded(true);
                }}
              >
                <span aria-hidden="true">…</span>
                {labels.expandNode}
              </button>
            </span>
          )}
          {field !== undefined && (
            <span className={css.label}>{fieldText(field)}:</span>
          )}
          {primitiveValue(value)}
          {!lastElement && <span className={css.punctuation}>,</span>}
        </span>
      </span>
    </>
  );
}
