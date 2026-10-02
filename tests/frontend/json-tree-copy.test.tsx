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
describe('DSH JSON inspector copy', () => {
  it('ignores clipboard settlement after the row changes or the tree unmounts', async () => {
    vi.useFakeTimers();
    const pending: (() => void)[] = [];
    writeText.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          pending.push(resolve);
        }),
    );
    const view = render(<JsonTree data={{ first: 1, second: 2 }} />);
    const rows = screen.getAllByRole('treeitem');
    fireEvent.mouseOver(rows[0] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Copy value' }));
    fireEvent.mouseOver(rows[1] as HTMLElement);
    await act(async () => {
      pending[0]!();
    });
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Copy value' }));
    view.unmount();
    const timerCount = vi.getTimerCount();
    await act(async () => {
      pending[1]!();
    });
    expect(vi.getTimerCount()).toBe(timerCount);
  });

  it('updates copy actions without rereading JSON properties on hover', () => {
    const readValue = vi.fn(() => 'payload '.repeat(100));
    const data = Object.fromEntries(
      Array.from({ length: 500 }, (_, index) => [
        `field${index}`,
        {
          get value() {
            return readValue();
          },
        },
      ]),
    );
    render(<JsonTree data={data} />);
    const rows = within(screen.getByRole('tree')).getAllByRole('treeitem');
    readValue.mockClear();

    fireEvent.mouseOver(rows[0] as HTMLElement);
    expect(
      within(rows[0] as HTMLElement).getByRole('button', {
        name: 'Copy pretty JSON',
      }),
    ).toBeTruthy();
    fireEvent.mouseOver(rows[1] as HTMLElement);
    expect(
      within(rows[0] as HTMLElement).queryByRole('button', {
        name: 'Copy pretty JSON',
      }),
    ).toBeNull();
    expect(
      within(rows[1] as HTMLElement).getByRole('button', {
        name: 'Copy pretty JSON',
      }),
    ).toBeTruthy();
    expect(readValue).not.toHaveBeenCalled();
  });

  it('copies an array element path without recovering data from rendered labels', async () => {
    render(<JsonTree data={{ list: [{ value: 'x' }, 'tail'] }} />);

    const tree = screen.getByRole('tree');
    fireEvent.click(
      within(tree).getByRole('button', { name: 'Expand JSON node' }),
    );
    const arrayRow = within(tree)
      .getAllByRole('treeitem')
      .find((row) => row.textContent?.startsWith('0:'));
    expect(arrayRow).toBeDefined();

    fireEvent.mouseOver(arrayRow as HTMLElement);
    const copyButton = screen.getByRole('button', { name: 'Copy pretty JSON' });
    fireEvent.contextMenu(copyButton);
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Copy property path' }),
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('$.list[0]');
    });
  });

  it('copies primitive and object values in every menu mode', async () => {
    const anonymous = Object.defineProperty(() => {}, 'name', { value: '' });
    render(
      <JsonTree
        data={{
          plain: 'hello',
          'odd-key': 3,
          object: { a: 1 },
          missing: undefined,
          big: 7n,
          symbol: Symbol(),
          symbolNamed: Symbol('token'),
          named: function named() {},
          anonymous,
        }}
      />,
    );

    const tree = screen.getByRole('tree');
    const row = (prefix: string) => {
      const match = within(tree)
        .getAllByRole('treeitem')
        .find((item) => item.textContent?.startsWith(prefix));
      expect(match).toBeDefined();
      return match as HTMLElement;
    };
    const hover = (prefix: string) => {
      fireEvent.mouseOver(row(prefix));
      return screen.getByRole('button', { name: /Cop/ });
    };
    const select = (name: string) => {
      const button = screen.getByRole('button', { name: /Cop/ });
      fireEvent.contextMenu(button);
      fireEvent.click(screen.getByRole('menuitem', { name }));
    };

    fireEvent.click(hover('plain:'));
    await waitFor(() => {
      expect(writeText).toHaveBeenLastCalledWith('hello');
    });

    hover('odd-key:');
    select('Copy property path');
    await waitFor(() => {
      expect(writeText).toHaveBeenLastCalledWith('$["odd-key"]');
    });
    select('Copy JSON');
    await waitFor(() => {
      expect(writeText).toHaveBeenLastCalledWith('3');
    });
    fireEvent.click(hover('odd-key:'));
    await waitFor(() => {
      expect(writeText).toHaveBeenLastCalledWith('3');
    });

    fireEvent.click(hover('object:'));
    await waitFor(() => {
      expect(writeText).toHaveBeenLastCalledWith('{\n  "a": 1\n}');
    });
    select('Copy compact JSON');
    await waitFor(() => {
      expect(writeText).toHaveBeenLastCalledWith('{"a":1}');
    });

    for (const [prefix, expected] of [
      ['missing:', 'undefined'],
      ['big:', '7'],
      ['symbol:', 'Symbol'],
      ['symbolNamed:', 'token'],
      ['named:', 'named'],
      ['anonymous:', 'Function'],
    ] as const) {
      fireEvent.click(hover(prefix));
      await waitFor(() => {
        expect(writeText).toHaveBeenLastCalledWith(expected);
      });
    }
  });

  it('reports clipboard failure, resets feedback, and clears a prior timer', async () => {
    vi.useFakeTimers();
    writeText.mockRejectedValue(new Error('denied'));
    const view = render(<JsonTree data={{ value: 'x' }} />);
    const row = screen.getByRole('treeitem');
    fireEvent.mouseOver(row);
    fireEvent.click(screen.getByRole('button', { name: 'Copy value' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Copy failed' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Copy failed' }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(screen.getByRole('button', { name: 'Copy value' })).toBeDefined();
    view.unmount();
  });

  it('keeps the copy action on its hovered row and clears stale targets', () => {
    const view = render(<JsonTree data={{ first: { a: 1 }, second: 2 }} />);
    const root = view.container.firstElementChild as HTMLElement;
    const tree = screen.getByRole('tree');
    const firstRow = within(tree).getAllByRole('treeitem')[0] as HTMLElement;
    const secondRow = within(tree).getAllByRole('treeitem')[1] as HTMLElement;

    fireEvent.mouseOver(firstRow);
    const copyButton = screen.getByRole('button', { name: 'Copy pretty JSON' });
    expect(firstRow.contains(copyButton)).toBe(true);
    fireEvent.mouseOver(copyButton);
    expect(
      screen.getByRole('button', { name: 'Copy pretty JSON' }),
    ).toBeDefined();
    fireEvent.mouseOver(firstRow);

    fireEvent.scroll(root);

    fireEvent.contextMenu(copyButton);
    fireEvent.mouseOver(secondRow);
    fireEvent.mouseOver(root);
    fireEvent.mouseLeave(root);
    expect(screen.getByRole('menu')).toBeDefined();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull();

    fireEvent.mouseOver(secondRow);
    expect(screen.getByRole('button', { name: 'Copy value' })).toBeDefined();
    fireEvent.mouseOver(root);
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull();

    fireEvent.scroll(root);
    view.rerender(<JsonTree data={{ replacement: 3 }} />);
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull();
  });

  it('copies the fixed root and clears it when the pointer leaves', async () => {
    const view = render(<JsonTree data={{ value: 1 }} />);
    const root = view.container.firstElementChild as HTMLElement;
    const openingBracket = root.querySelector<HTMLElement>(
      '[data-json-root-row]',
    );
    expect(openingBracket).not.toBeNull();

    fireEvent.mouseOver(openingBracket as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Copy pretty JSON' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('{\n  "value": 1\n}');
    });

    fireEvent.mouseLeave(root);
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull();
  });
});
