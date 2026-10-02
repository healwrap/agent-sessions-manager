// Adapted from DeepSeek Harness JsonTree regression tests (MIT); see frontend/public/harness-license.txt.
import { cleanup } from '@testing-library/react';
import { beforeEach, afterEach, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { JsonTree as LocalizedJsonTree } from '../../frontend/src/components/json-tree/json-tree';
const jsonTreeLabels = {
  copyValue: 'Copy value',
  copyJson: 'Copy JSON',
  copyPath: 'Copy property path',
  copyPrettyJson: 'Copy pretty JSON',
  copyCompactJson: 'Copy compact JSON',
  copied: 'Copied',
  copyFailed: 'Copy failed',
  collapseNode: 'Collapse JSON node',
  expandNode: 'Expand JSON node',
  copyButtonTitle: (action: string) => action,
};
export function JsonTree(
  props: Omit<ComponentProps<typeof LocalizedJsonTree>, 'label' | 'labels'> & {
    label?: string;
  },
) {
  return <LocalizedJsonTree label="JSON" {...props} labels={jsonTreeLabels} />;
}

export let writeText: ReturnType<typeof vi.fn<Clipboard['writeText']>>;
let originalClipboard: PropertyDescriptor | undefined;

beforeEach(() => {
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  writeText = vi.fn<Clipboard['writeText']>().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalClipboard === undefined)
    Reflect.deleteProperty(navigator, 'clipboard');
  else Object.defineProperty(navigator, 'clipboard', originalClipboard);
});

export function stubStringLayout(scrollHeight = 200): void {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(
    scrollHeight,
  );
  const computedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const style = computedStyle(element);
    style.lineHeight = '16px';
    if (style.paddingBottom === '') style.paddingBottom = '0px';
    return style;
  });
}
