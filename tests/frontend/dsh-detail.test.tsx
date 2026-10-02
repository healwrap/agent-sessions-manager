import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { Detail, Event } from '../../frontend/src/lib/types';
import { DetailContent } from '../../frontend/src/components/detail/detail-content';
import { RecordTiming } from '../../frontend/src/components/detail/record-timing';
import { TraceTable } from '../../frontend/src/components/trace-table';
import { SessionStore } from '../../frontend/src/state/session-store';
import {
  eventLabel,
  assistantWaitRatio,
} from '../../frontend/src/lib/event-presentation';
const event = {
  ref: 'E/361',
  turn: 1,
  step: 55,
  kind: 'tool',
  name: 'read_image',
  preview: '{"path":"original"}',
  status: 'completed',
  timestamp: '2026-09-30T03:30:02.495Z',
  completed_at: '2026-09-30T03:30:02.538Z',
  duration_ms: 43,
  position: 0,
  output_preview: 'original image result',
  layer: '助手消息',
} as Event;
const detail = {
  event,
  text: '{"path":"original"}',
  part: 'input',
  page: 1,
  pages: 1,
  output_available: true,
  provider_label: 'DeepSeek Harness',
  tool_schema: {
    name: 'read_image',
    description: 'Historical image schema',
    parameters: { type: 'object', properties: { path: { type: 'string' } } },
  },
  nested: [],
} as Detail;
const output = {
  ...detail,
  part: 'output',
  text: 'original image result',
  attachments: [
    {
      index: 1,
      attachmentId: 'sha256:original',
      mediaType: 'image/png',
      name: 'original.png',
      bytes: 100,
    },
  ],
} as Detail;
const render = (tab: string) =>
  renderToString(
    <DetailContent
      detail={tab === '结果' ? output : detail}
      output={output}
      tab={tab}
      id="dsh:local:project/session"
      change={() => {}}
    />,
  );
describe('DSH detail and list parity', () => {
  it('shows actual results, original attachments, historical schema and timing together', () => {
    const html = render('概述');
    expect(html).toContain('original image result');
    expect(html).toContain('Historical image schema');
    expect(html).toContain('43 毫秒');
    expect(html).toContain('助手消息');
    expect(html).toContain('/api/attachment?');
    expect(html).toContain('index=1');
    expect(html).toContain('part=output');
    expect(html).not.toContain('点击查看本次调用的结果');
  });
  it('renders the historical schema and image in their tabs', () => {
    expect(render('Schema')).toContain('Historical image schema');
    expect(render('Schema')).not.toContain('未保存工具 Schema');
    expect(render('结果')).toContain('<img');
    expect(render('结果')).toContain('original image result');
  });
  it('preserves tool output line breaks and literal markup instead of interpreting Markdown', () => {
    const html = renderToString(
      <DetailContent
        detail={{
          ...output,
          text: '<path>original</path>\n\n**literal result**',
        }}
        output={null}
        tab="结果"
        id="dsh:local:project/session"
        change={() => {}}
      />,
    );
    expect(html).toContain(
      '<pre>&lt;path&gt;original&lt;/path&gt;\n\n**literal result**</pre>',
    );
    expect(html).not.toContain('<strong>literal result</strong>');
  });
  it('uses an arrow and result summary instead of character counts in tool rows', () => {
    const state = new SessionStore().state;
    state.views.trace.events = [{ ...event, output_chars: 999 }];
    const html = renderToString(<TraceTable state={state} />);
    expect(html).toContain('original image result');
    expect(html).toContain('→');
    expect(html).not.toContain('999 字符');
  });
  it('keeps visible thinking in a disclosure within the assistant record', () => {
    const html = renderToString(
      <DetailContent
        detail={{
          ...detail,
          event: { ...event, kind: 'assistant' },
          thinking_text: 'recorded thinking',
          output_text: 'recorded answer',
          tool_calls: [
            { ref: 'E/361', name: 'read_image', preview: 'original arguments' },
          ],
        }}
        output={null}
        tab="预览"
        id="dsh:local:project/session"
        change={() => {}}
      />,
    );
    expect(html).toContain('thinking-disclosure');
    expect(html).toContain('recorded thinking');
    expect(html).toContain('recorded answer');
    expect(html).toContain('open=""');
    expect(html).toContain('打开工具调用概述');
    expect(html).toContain('original arguments');
  });
  it('uses the same recorded first-token, generation and throughput metrics as DSH', () => {
    const assistant = {
      ...event,
      kind: 'assistant',
      timestamp: '2026-01-01T00:00:00Z',
      first_token_at: '2026-01-01T00:00:01Z',
      completed_at: '2026-01-01T00:00:03Z',
      duration_ms: 3000,
      usage: { outputTokens: 40 },
    };
    const html = renderToString(<RecordTiming event={assistant} />);
    expect(html).toContain('1000 毫秒');
    expect(html).toContain('2000 毫秒');
    expect(html).toContain('20.00 token / 秒');
    expect(assistantWaitRatio(assistant)).toBeCloseTo(100 / 3);
    expect(
      assistantWaitRatio({ ...assistant, first_token_at: null }),
    ).toBeNull();
    expect(
      eventLabel({ ...event, kind: 'context', name: '系统提示词' }),
    ).toEqual(['系统', 'systemNeutral']);
  });
});
