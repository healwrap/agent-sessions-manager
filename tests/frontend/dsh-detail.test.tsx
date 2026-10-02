import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { Detail, Event } from '../../frontend/src/lib/types';
import { DetailContent } from '../../frontend/src/components/detail/detail-content';
import { detailTabs } from '../../frontend/src/components/detail-panel';
import { RecordTiming } from '../../frontend/src/components/detail/record-timing';
import { RequestContent } from '../../frontend/src/components/detail/request-content';
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
  hierarchy_parent_ref: 'E/5',
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
    expect(html).not.toContain('引用');
    expect(html).not.toContain('E/361');
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
  it('uses native DSH tabs and exact message source instead of a file path', () => {
    expect(detailTabs(detail)).toEqual([
      '概述',
      '参数',
      '结果',
      'Schema',
      '计时',
    ]);
    const message = {
      ...detail,
      event: { ...event, kind: 'assistant' },
      message_source: {
        kind: 'model',
        provider: 'original provider',
        model: 'original model',
      },
      source: '/private/session.jsonl',
    };
    expect(detailTabs(message)).toEqual(['概述', '预览', '原始内容']);
    const html = renderToString(
      <DetailContent
        detail={message}
        output={null}
        tab="来源"
        id="dsh:local:project/session"
        change={() => {}}
      />,
    );
    expect(html).toContain('original provider');
    expect(html).toContain('original model');
    expect(html).not.toContain('/private/session.jsonl');
    expect(detailTabs({ ...message, message_source: undefined })).not.toContain(
      '来源',
    );
    expect(
      detailTabs({
        ...message,
        event: { ...event, kind: 'context', name: '上下文压缩' },
      }),
    ).toEqual(['概述', '原始内容']);
  });
  it('shows DSH user and context records as status, duration and preview', () => {
    const user = {
      ...detail,
      event: { ...event, kind: 'user', name: '用户' },
      text: 'Original user message',
      message_source: { kind: 'user' },
    } as Detail;
    const html = renderToString(
      <DetailContent
        detail={user}
        output={null}
        tab="概述"
        id="dsh:local:project/session"
        change={() => {}}
      />,
    );
    expect(html).toContain('Original user message');
    expect(html).toContain('0.04 秒');
    expect(html).toContain('用户');
    expect(html).not.toContain('引用');
  });
  it('uses the native system prompt and tool catalog tabs with a recorded diff', () => {
    const prompt = {
      ...detail,
      event: { ...event, kind: 'context', name: '系统提示词' },
      prompt_snapshot: {
        system: 'updated system',
        tools: [
          {
            name: 'read_image',
            description: 'updated tool',
            parameters: { type: 'object' },
          },
        ],
      },
      previous_prompt_snapshot: {
        system: 'original system',
        tools: [
          {
            name: 'read_image',
            description: 'original tool',
            parameters: { type: 'object' },
          },
        ],
      },
    } as Detail;
    expect(detailTabs(prompt)).toEqual(['差异', '系统提示词', '工具']);
    const tab = (name: string) =>
      renderToString(
        <DetailContent
          detail={prompt}
          output={null}
          tab={name}
          id="dsh:local:project/session"
          change={() => {}}
        />,
      );
    expect(tab('系统提示词')).toContain('updated system');
    expect(tab('工具')).toContain('updated tool');
    expect(tab('差异')).toContain('original system');
    expect(tab('差异')).toContain('updated tool');
    expect(
      detailTabs({ ...prompt, previous_prompt_snapshot: undefined }),
    ).toEqual(['系统提示词', '工具']);
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
  it('keeps compaction request boundaries and purpose visible', () => {
    const compacted = {
      ...detail,
      request_result_ref: 'E/361',
      event: {
        ...event,
        kind: 'context',
        name: '上下文压缩',
        request_number: 2,
      },
    } as Detail;
    const state = new SessionStore().state;
    state.views.trace.data = {
      provider_label: 'DeepSeek Harness',
      turn_summaries: {},
      call_groups: {},
    } as typeof state.views.trace.data;
    state.views.trace.events = [compacted.event];
    const row = renderToString(<TraceTable state={state} />);
    expect(row).toContain('请求 #2 · 压缩');
    const overview = renderToString(
      <RequestContent detail={compacted} tab="概述" change={() => {}} />,
    );
    expect(overview).toContain('用途');
    expect(overview).toContain('压缩后上下文');
    const toolOnly = {
      ...detail,
      request_result_ref: null,
      request_tool_calls: 1,
      request_config: { provider: 'test-provider', model: 'test-model' },
      event: { ...event, request_number: 3 },
    } as Detail;
    state.views.trace.events = [toolOnly.event];
    const toolRow = renderToString(<TraceTable state={state} />);
    expect(toolRow).toContain('请求 #3');
    const toolRequest = renderToString(
      <RequestContent detail={toolOnly} tab="概述" change={() => {}} />,
    );
    expect(toolRequest).toContain('test-provider');
    expect(toolRequest).toContain('test-model');
    expect(toolRequest).not.toContain('助手消息');
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
    expect(html).toContain('aria-expanded="true"');
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
    const requestHtml = renderToString(
      <RecordTiming event={assistant} request />,
    );
    expect(requestHtml).toContain('总时长');
    expect(requestHtml).toContain('3.00 秒');
    expect(requestHtml).toContain('20.0 tok/s');
    expect(assistantWaitRatio(assistant)).toBeCloseTo(100 / 3);
    expect(
      assistantWaitRatio({ ...assistant, first_token_at: null }),
    ).toBeNull();
    expect(
      eventLabel({ ...event, kind: 'context', name: '系统提示词' }),
    ).toEqual(['系统', 'systemNeutral']);
    expect(eventLabel({ ...event, kind: 'subtool' })).toEqual([
      '子工具',
      'subtoolAmber',
    ]);
    expect(
      eventLabel({ ...event, kind: 'context', name: '上下文压缩' }),
    ).toEqual(['已压缩', 'compacted']);
  });
  it('shows the native assistant request link, output tokens, preview and timing sections', () => {
    const assistant = {
      ...detail,
      event: {
        ...event,
        kind: 'assistant',
        request_number: 1,
        usage: { outputTokens: 457 },
      },
      thinking_text: 'recorded thinking',
      output_text: 'recorded answer',
      request_tool_calls: 2,
      request_config: { provider: 'test-provider' },
    };
    const html = renderToString(
      <DetailContent
        detail={assistant}
        output={null}
        tab="概述"
        id="dsh:local:project/session"
        change={() => {}}
      />,
    );
    expect(html).toContain('请求 #1');
    expect(html).toContain('457 tok');
    expect(html).toContain('预览');
    expect(html).toContain('请求计时');
    expect(html).not.toContain('引用');
    const requestHtml = renderToString(
      <RequestContent detail={assistant} tab="概述" change={() => {}} />,
    );
    expect(requestHtml).toContain('工具调用');
    expect(requestHtml).toContain('选项');
    expect(requestHtml).toContain('用量');
  });
});
