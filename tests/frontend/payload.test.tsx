// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Payload } from '../../frontend/src/components/detail/payload';
import { DetailContent } from '../../frontend/src/components/detail/detail-content';
import type { Detail } from '../../frontend/src/lib/types';
afterEach(cleanup);

describe('tool inspector integration', () => {
  it('renders todo objects and results as DSH inline JSON previews, with nested nodes initially folded', () => {
    render(
      <Payload
        text={JSON.stringify({
          success: true,
          finalTodos: [{ content: '任务', status: 'completed', id: 1 }],
        })}
        label="结果 JSON"
      />,
    );
    const tree = screen.getByRole('tree', { name: '结果 JSON' });
    expect(tree.textContent).toBe(
      'success:true,finalTodos:[{content: "任务", status: "completed", id: 1}]',
    );
    expect(screen.queryByText(/Object \(|Array \(/)).toBeNull();
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '展开' }));
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(3);
  });

  it('uses native preview/full string limits and retains expansions when the same payload refreshes', () => {
    const text = '{"nested":{"value":"unchanged"}}';
    const view = render(<Payload text={text} preview />);
    expect(view.container.firstElementChild?.getAttribute('style')).toContain(
      '--json-tree-collapsed-lines: 3',
    );
    fireEvent.click(screen.getByRole('button', { name: '展开' }));
    view.rerender(<Payload text={text} />);
    expect(view.container.firstElementChild?.getAttribute('style')).toContain(
      '--json-tree-collapsed-lines: 12',
    );
    expect(screen.getByRole('button', { name: '收起' })).toBeTruthy();
    expect(screen.getAllByText('"unchanged"')).toHaveLength(2);
  });

  it.each([
    'null',
    '123',
    '"原文"',
    '{incomplete',
    '<path>literal</path>\n\n**text**',
  ])('keeps scalar/non-JSON payloads intact: %s', (text) => {
    const view = render(<Payload text={text} />);
    expect(screen.queryByRole('tree')).toBeNull();
    expect(view.container.querySelector('pre')?.textContent).toBe(text);
  });

  it('preserves original JSON whitespace in the raw view', () => {
    const text = '{\n  "name": "原值",\n  "list": [1, 2]\n}\n';
    const view = render(<Payload text={text} raw />);
    expect(view.container.querySelector('pre')?.textContent).toBe(text);
    expect(screen.queryByRole('tree')).toBeNull();
  });

  it('opens the full tab from each overview title and gives schema parameters their own labeled inspector', () => {
    const detail = {
      event: {
        ref: 'E/1',
        turn: 1,
        kind: 'tool',
        name: 'sample',
        status: 'completed',
        duration_ms: 20,
      },
      text: '{"file_path":"sample.png"}',
      part: 'input',
      page: 1,
      pages: 1,
      provider_label: 'DeepSeek Harness',
      output_available: true,
      nested: [],
      tool_schema: {
        name: 'sample',
        description: 'Original schema',
        parameters: {
          type: 'object',
          properties: { file_path: { type: 'string' } },
          required: ['file_path'],
        },
      },
    } as unknown as Detail;
    const change = vi.fn();
    const props = {
      detail,
      output: { ...detail, part: 'output', text: '{"success":true}' } as Detail,
      id: 'fixture',
      change,
    };
    const view = render(<DetailContent {...props} tab="概述" />);
    for (const label of ['参数', '结果', 'Schema', '计时']) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(change).toHaveBeenLastCalledWith(label);
    }
    expect(
      view.container.querySelector('.overview-sections details'),
    ).toBeNull();
    view.rerender(<DetailContent {...props} tab="Schema" />);
    expect(screen.getByRole('heading', { name: '参数' })).toBeTruthy();
    const tree = screen.getByRole('tree', { name: 'sample 参数 JSON' });
    expect(tree.textContent).toBe(
      'type:"object",properties:{file_path: {type: "string"}},required:["file_path"]',
    );
  });
});
