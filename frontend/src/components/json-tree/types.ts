// Adapted from DeepSeek Harness JsonTree (MIT); see frontend/public/harness-license.txt.

export interface JsonTreeLabels {
  /** Menu item: copy the raw primitive value. */
  copyValue: string;
  /** Menu item: copy the value as compact JSON (primitive rows). */
  copyJson: string;
  /** Menu item: copy the property path. */
  copyPath: string;
  /** Menu item: copy the value as pretty-printed JSON. */
  copyPrettyJson: string;
  /** Menu item: copy the value as compact JSON (object rows). */
  copyCompactJson: string;
  /** Copy-button state label after a successful copy. */
  copied: string;
  /** Copy-button state label after a failed copy. */
  copyFailed: string;
  /** Expander aria label while expanded. */
  collapseNode: string;
  /** Expander aria label while collapsed. */
  expandNode: string;
  /** Copy-button tooltip, given the current action label. */
  copyButtonTitle: (action: string) => string;
}

export type JsonPath = readonly (number | string)[];

export interface RowTarget {
  path: JsonPath;
  value: unknown;
}

export type CopyMode = 'json' | 'path' | 'prettyJson' | 'value';

export interface CopySnapshot {
  id: string;
  target: RowTarget;
  state: 'idle' | 'copied' | 'failed';
  menuOpen: boolean;
}

/** Props for the read-only, token-themed JSON tree. */
export interface JsonTreeProps {
  /** Parsed JSON object or array. */
  data: object | unknown[];
  /** Accessible label for the tree. */
  label: string;
  /** Optional positioning class owned by the caller. */
  className?: string | undefined;
  /** Maximum visible lines per collapsed string; defaults to 3. */
  collapsedStringLines?: number;
  /** Optional wrap toggle; each expansion reads the shared default without changing other open strings. */
  stringWrapping?:
    | {
        /** Localized label for the wrapping toggle. */
        label: string;
        /** Read the wrapping preference when a string is expanded. @returns Whether to wrap long lines. */
        getDefault: () => boolean;
        /** Remember a user toggle for future expansions. @param wrapped - Whether to wrap long lines. */
        setDefault: (wrapped: boolean) => void;
      }
    | undefined;
  /** Whether JSON rows expose copy actions. */
  copyable?: boolean;
  /** Whether the top-level object or array is always expanded. */
  expandTopLevel?: boolean;
  /** Localized display copy supplied by the owning render site. */
  labels: JsonTreeLabels;
}
