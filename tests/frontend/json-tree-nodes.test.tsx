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
describe('DSH JSON inspector nodes', () => {
  it('keeps the top level open and renders expandable value previews', () => {
    render(
      <JsonTree
        label="Payload"
        data={{
          nested: { answer: 42 },
          list: ['alpha', 'beta'],
        }}
      />,
    );

    const tree = screen.getByRole('tree', { name: 'Payload' });
    const rows = within(tree).getAllByRole('treeitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toBe('nested:{answer: 42},');
    expect(rows[1]?.textContent).toBe('list:["alpha", "beta"]');

    const expanders = within(tree).getAllByRole('button', {
      name: 'Expand JSON node',
    });
    expect(expanders[0]?.tabIndex).toBe(0);
    expect(expanders[1]?.tabIndex).toBe(-1);

    fireEvent.click(expanders[0] as HTMLElement);
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(3);
    expect(screen.getByText('answer:')).toBeDefined();
    expect(
      within(tree).getByRole('button', { name: 'Collapse JSON node' }),
    ).toBeDefined();
  });

  it('moves the single tab stop between visible expanders with arrow keys', () => {
    render(
      <JsonTree
        expandTopLevel={false}
        data={{
          first: { nested: 1 },
          second: { nested: 2 },
        }}
      />,
    );

    const tree = screen.getByRole('tree', { name: 'JSON' });
    const root = within(tree).getByRole('button', {
      name: 'Collapse JSON node',
    });
    const children = within(tree).getAllByRole('button', {
      name: 'Expand JSON node',
    });

    expect(root.tabIndex).toBe(0);
    fireEvent.keyDown(root, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(children[0]);
    expect(root.tabIndex).toBe(-1);
    expect(children[0]?.tabIndex).toBe(0);

    fireEvent.keyDown(children[0] as HTMLElement, { key: 'ArrowRight' });
    expect(children[0]?.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(children[0] as HTMLElement, { key: 'ArrowLeft' });
    expect(children[0]?.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(children[0] as HTMLElement, { key: 'Enter' });

    fireEvent.keyDown(children[0] as HTMLElement, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(root);
    fireEvent.keyDown(root, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(children[1]);
  });

  it('renders empty containers, JSON-adjacent primitives, and bounded deep previews', () => {
    const anonymous = Object.defineProperty(() => {}, 'name', { value: '' });
    const date = new Date('2026-07-28T00:00:00.000Z');
    const data = {
      '': 'empty key',
      nil: null,
      text: 'quoted',
      flag: true,
      count: 3,
      big: 4n,
      date,
      named: function named() {},
      missing: undefined,
      symbol: Symbol('token'),
      emptyObject: {},
      emptyArray: [],
      primitivePreview: {
        nil: null,
        flag: false,
        big: 9n,
        missing: undefined,
      },
      exoticPreview: {
        symbol: Symbol(),
        named: function sample() {},
        anonymous,
        date,
      },
      wideObject: { a: 1, b: 2, c: 3, d: 4, e: 5 },
      wideArray: [1, 2, 3, 4, 5, 6],
      deep: { a: { b: { c: 1 } } },
    };
    render(<JsonTree copyable={false} data={data} />);

    const text = screen.getByRole('tree').textContent;
    expect(text).toContain('"":\"empty key\"');
    expect(text).toContain('nil:null');
    expect(text).toContain('flag:true');
    expect(text).toContain('count:3');
    expect(text).toContain('big:4n');
    expect(text).toContain('date:2026-07-28T00:00:00.000Z');
    expect(text).toContain('named:function() { }');
    expect(text).toContain('missing:undefined');
    expect(text).toContain('symbol:Symbol(token)');
    expect(text).toContain('emptyObject:{}');
    expect(text).toContain('emptyArray:[]');
    expect(text).toContain(
      'primitivePreview:{nil: null, flag: false, big: 9, missing: undefined}',
    );
    expect(text).toContain(
      'exoticPreview:{symbol: Symbol, named: sample, anonymous: Function, date: }',
    );
    expect(text).toContain('wideObject:{a: 1, b: 2, c: 3, d: 4, …}');
    expect(text).toContain('wideArray:[1, 2, 3, 4, 5, …]');
    expect(text).toContain('deep:{a: {b: {…}}}');
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull();
    fireEvent.mouseOver(screen.getByRole('tree').parentElement as HTMLElement);
  });

  it('renders child commas and lets a clickable property label toggle its node', () => {
    render(
      <JsonTree
        data={{
          parent: { emptyObject: {}, emptyArray: [], scalar: 1, last: 2 },
        }}
      />,
    );

    fireEvent.click(screen.getByText('parent:'));
    const tree = screen.getByRole('tree');
    const rows = within(tree).getAllByRole('treeitem');
    expect(
      rows.find((row) => row.textContent === 'emptyObject:{},'),
    ).toBeDefined();
    expect(
      rows.find((row) => row.textContent === 'emptyArray:[],'),
    ).toBeDefined();
    expect(rows.find((row) => row.textContent === 'scalar:1,')).toBeDefined();
    expect(rows.find((row) => row.textContent === 'last:2')).toBeDefined();

    fireEvent.click(screen.getByText('parent:'));
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(1);
  });

  it('assigns the initial array tab stop and supports an empty collapsible root', () => {
    const first = render(<JsonTree data={['plain', { nested: true }]} />);
    const tree = screen.getByRole('tree');
    expect(tree.textContent).toContain('0:"plain"');
    expect(
      within(tree).getByRole('button', { name: 'Expand JSON node' }).tabIndex,
    ).toBe(0);
    first.unmount();

    render(<JsonTree expandTopLevel={false} data={{}} />);
    expect(screen.getByRole('tree').textContent).toBe('{}');
    expect(screen.queryByRole('button', { name: /JSON node/ })).toBeNull();
  });
});
