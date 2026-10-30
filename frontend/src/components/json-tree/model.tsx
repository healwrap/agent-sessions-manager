// Adapted from DeepSeek Harness JsonTree (MIT); see frontend/public/harness-license.txt.
import type { JsonPath, RowTarget, CopyMode } from './types';
import type { ReactNode } from 'react';
import css from './classes';
const OBJECT_PREVIEW_LIMIT = 4;
const ARRAY_PREVIEW_LIMIT = 5;
const PREVIEW_DEPTH_LIMIT = 2;

export function isExpandableValue(value: unknown): value is object | unknown[] {
  return (
    typeof value === 'object' && value !== null && !(value instanceof Date)
  );
}

export function entriesOf(
  value: object | unknown[],
): readonly (readonly [string, unknown])[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => [String(index), item] as const);
  }
  return Object.keys(value).map(
    (key) => [key, (value as Record<string, unknown>)[key]] as const,
  );
}

export function bracketOf(
  value: object | unknown[],
): readonly [string, string] {
  return Array.isArray(value) ? ['[', ']'] : ['{', '}'];
}

function previewPrimitive(value: unknown): ReactNode {
  if (value === null) return <span className={css.keywordValue}>null</span>;
  if (typeof value === 'string') {
    return <span className={css.stringValue}>{JSON.stringify(value)}</span>;
  }
  if (typeof value === 'number') {
    return <span className={css.numberValue}>{String(value)}</span>;
  }
  if (typeof value === 'boolean') {
    return <span className={css.keywordValue}>{String(value)}</span>;
  }
  if (typeof value === 'bigint') {
    return <span className={css.otherValue}>{value.toString()}</span>;
  }
  if (typeof value === 'undefined') {
    return <span className={css.otherValue}>undefined</span>;
  }
  if (typeof value === 'symbol') {
    return (
      <span className={css.otherValue}>{value.description ?? 'Symbol'}</span>
    );
  }
  if (typeof value === 'function') {
    return <span className={css.otherValue}>{value.name || 'Function'}</span>;
  }
  return null;
}

export function previewValue(value: unknown, depth: number): ReactNode {
  if (!isExpandableValue(value)) return previewPrimitive(value);

  const array = Array.isArray(value);
  const entries = entriesOf(value);
  const limit = array ? ARRAY_PREVIEW_LIMIT : OBJECT_PREVIEW_LIMIT;
  const visible = entries.slice(0, limit);
  const [open, close] = bracketOf(value);

  return (
    <>
      <span className={css.punctuation}>{open}</span>
      {depth >= PREVIEW_DEPTH_LIMIT ? (
        <span className={css.previewEllipsis}>…</span>
      ) : (
        visible.map(([key, item], index) => (
          <span key={key}>
            {index > 0 && <span className={css.punctuation}>, </span>}
            {!array && (
              <>
                <span className={css.previewProperty}>{key}</span>
                <span className={css.punctuation}>: </span>
              </>
            )}
            {previewValue(item, depth + 1)}
          </span>
        ))
      )}
      {depth < PREVIEW_DEPTH_LIMIT && entries.length > limit && (
        <span className={css.previewEllipsis}>, …</span>
      )}
      <span className={css.punctuation}>{close}</span>
    </>
  );
}

export function primitiveValue(value: unknown): ReactNode {
  if (value === null) return <span className={css.keywordValue}>null</span>;
  if (typeof value === 'string') {
    return <span className={css.stringValue}>{JSON.stringify(value)}</span>;
  }
  if (typeof value === 'boolean') {
    return <span className={css.keywordValue}>{String(value)}</span>;
  }
  if (typeof value === 'number') {
    return <span className={css.numberValue}>{String(value)}</span>;
  }
  if (typeof value === 'bigint') {
    return <span className={css.numberValue}>{`${value.toString()}n`}</span>;
  }
  if (value instanceof Date) {
    return <span className={css.otherValue}>{value.toISOString()}</span>;
  }
  if (typeof value === 'function') {
    return <span className={css.otherValue}>function() {'{ }'}</span>;
  }
  if (typeof value === 'undefined') {
    return <span className={css.otherValue}>undefined</span>;
  }
  return <span className={css.otherValue}>{(value as symbol).toString()}</span>;
}

export function fieldText(field: string): string {
  return field === '' ? '""' : field;
}

export function pathId(path: JsonPath): string {
  return path
    .map((part) =>
      typeof part === 'number'
        ? `n${String(part)}`
        : `s${String(part.length)}:${part}`,
    )
    .join('/');
}

export function claimFocus(button: HTMLElement): void {
  button.focus({ preventScroll: true });
}

export function moveFocus(button: HTMLElement, direction: -1 | 1): void {
  const tree = button.closest<HTMLElement>('[role="tree"]');
  /* v8 ignore next -- JsonTree attaches expander handlers only beneath its owning role=tree. */
  if (tree === null) return;
  const expanders = Array.from(
    tree.querySelectorAll<HTMLElement>('[data-json-expander]'),
  );
  const current = expanders.indexOf(button);
  /* v8 ignore next -- the current expander is a member of the queried non-empty set. */
  if (current < 0 || expanders.length === 0) return;
  const next = (current + direction + expanders.length) % expanders.length;
  const nextExpander = expanders[next];
  /* v8 ignore next -- modulo over the non-empty expander set always resolves a member. */
  // Keyboard traversal may reveal the next row; clicking an expander stays put.
  if (nextExpander !== undefined) nextExpander.focus();
}

function formattedPath(path: JsonPath): string {
  return path.reduce<string>((result, part) => {
    if (typeof part === 'number') return `${result}[${String(part)}]`;
    return /^[A-Za-z_$][\w$]*$/.test(part)
      ? `${result}.${part}`
      : `${result}[${JSON.stringify(part)}]`;
  }, '$');
}

export function copyText(target: RowTarget, mode: CopyMode): string {
  if (mode === 'path') return formattedPath(target.path);
  if (mode === 'prettyJson') return JSON.stringify(target.value, null, 2);
  if (mode === 'json') return JSON.stringify(target.value);
  if (typeof target.value === 'string') return target.value;
  if (typeof target.value === 'undefined') return 'undefined';
  if (typeof target.value === 'bigint') return target.value.toString();
  if (typeof target.value === 'symbol')
    return target.value.description ?? 'Symbol';
  if (typeof target.value === 'function')
    return target.value.name || 'Function';
  return JSON.stringify(target.value);
}
