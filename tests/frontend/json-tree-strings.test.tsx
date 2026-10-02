// @vitest-environment jsdom
// Adapted from DeepSeek Harness JsonTree regression tests (MIT); see frontend/public/harness-license.txt.
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JsonTree, writeText, stubStringLayout } from './json-tree-fixture';
describe('DSH JSON inspector strings', () => {
  it('expands raw strings without ResizeObserver and keeps the visible viewport limit', () => {
    stubStringLayout();
    vi.stubGlobal('ResizeObserver', undefined);
    let rawTop = 150;
    const view = render(
      <div style={{ overflowY: 'auto', paddingBottom: '10px' }}>
        <JsonTree data={{ first: 'raw\ntext', last: 'last\ntext' }} />
      </div>,
    );
    const clip = view.container.firstElementChild as HTMLElement;
    vi.spyOn(clip, 'clientTop', 'get').mockReturnValue(2);
    vi.spyOn(clip, 'clientHeight', 'get').mockReturnValue(140);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return new DOMRect(0, this === clip ? 100 : rawTop, 200, 140);
      },
    );
    const rows = within(screen.getByRole('tree')).getAllByRole('treeitem');
    fireEvent.click(
      within(rows[0] as HTMLElement).getByRole('button', {
        name: 'Expand JSON node',
      }),
    );
    const raw = rows[0]?.querySelector('pre') as HTMLPreElement;
    expect(raw.textContent).toBe('raw\ntext');
    expect(raw.style.maxHeight).toBe('78px');
    expect(raw.nextElementSibling?.textContent).toBe(',');

    rawTop = 80;
    fireEvent.scroll(clip);
    expect(raw.style.maxHeight).toBe('126px');
    rawTop = 300;
    fireEvent.resize(window);
    expect(raw.style.maxHeight).toBe('16px');
    fireEvent.click(
      within(rows[0] as HTMLElement).getByRole('button', {
        name: 'Collapse JSON node',
      }),
    );
    expect(raw.isConnected).toBe(false);
    rawTop = 100;
    fireEvent.scroll(clip);
    expect(raw.style.maxHeight).toBe('16px');

    fireEvent.click(
      within(rows[1] as HTMLElement).getByRole('button', {
        name: 'Expand JSON node',
      }),
    );
    expect(
      rows[1]?.querySelector('pre')?.nextElementSibling?.textContent,
    ).not.toBe(',');
  });

  it('shows the string expander only beyond the configured collapsed line count', () => {
    stubStringLayout(48);
    let resize: (() => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const data = { text: 'three lines of text' };
    const view = render(<JsonTree data={data} />);
    expect(
      screen.queryByRole('button', { name: 'Expand JSON node' }),
    ).toBeNull();
    view.rerender(<JsonTree data={data} collapsedStringLines={2} />);
    expect(
      screen.getByRole('button', { name: 'Expand JSON node' }),
    ).toBeTruthy();
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(16);
    act(() => {
      resize?.();
    });
    expect(
      screen.queryByRole('button', { name: 'Expand JSON node' }),
    ).toBeNull();
    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  it('keeps raw strings intact and samples the wrapping preference on every expansion', async () => {
    stubStringLayout();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    let wrapped = false;
    const stringWrapping = {
      label: 'Wrap lines',
      getDefault: () => wrapped,
      setDefault: (value: boolean) => {
        wrapped = value;
      },
    };
    const original = `  leading spaces\n\t"quoted" \\${'long'.repeat(100)}\nlast line\n`;
    render(
      <JsonTree
        data={{ first: original, second: original }}
        stringWrapping={stringWrapping}
      />,
    );
    const [first, second] = within(screen.getByRole('tree')).getAllByRole(
      'treeitem',
    );
    const a = within(first as HTMLElement);
    const b = within(second as HTMLElement);
    fireEvent.click(a.getByRole('button', { name: 'Expand JSON node' }));
    fireEvent.click(b.getByRole('button', { name: 'Expand JSON node' }));
    expect(
      a
        .getByRole('button', { name: 'Wrap lines' })
        .getAttribute('aria-pressed'),
    ).toBe('false');

    fireEvent.click(a.getByRole('button', { name: 'Wrap lines' }));
    expect(wrapped).toBe(true);
    expect(
      a
        .getByRole('button', { name: 'Wrap lines' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      b
        .getByRole('button', { name: 'Wrap lines' })
        .getAttribute('aria-pressed'),
    ).toBe('false');

    fireEvent.click(b.getByRole('button', { name: 'Collapse JSON node' }));
    fireEvent.click(b.getByRole('button', { name: 'Expand JSON node' }));
    expect(
      b
        .getByRole('button', { name: 'Wrap lines' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(b.getByRole('button', { name: 'Wrap lines' }));
    expect(wrapped).toBe(false);
    expect(
      a
        .getByRole('button', { name: 'Wrap lines' })
        .getAttribute('aria-pressed'),
    ).toBe('true');

    fireEvent.click(a.getByRole('button', { name: 'Collapse JSON node' }));
    fireEvent.click(a.getByRole('button', { name: 'Expand JSON node' }));
    const toggle = a.getByRole('button', { name: 'Wrap lines' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    const contents = document.getElementById(
      toggle.getAttribute('aria-controls') as string,
    );
    expect(contents?.textContent).toBe(original);
    fireEvent.click(a.getByRole('button', { name: 'Copy value' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(original);
    });
  });
});
