import type { Detail } from '../../lib/types';
import { statusLabels } from '../../lib/types';
import { sessionStore } from '../../state/session-store';
import { formatRecordedDuration } from '../../lib/recorded-time';
import { Payload } from './payload';
import { RecordContent } from './record-content';
import { RecordTiming } from './record-timing';

export function DetailContent({
  detail,
  output,
  tab,
  id,
  change,
}: {
  detail: Detail;
  output: Detail | null;
  tab: string;
  id: string;
  change: (tab: string) => void;
}) {
  const event = detail.event,
    tool = ['tool', 'subtool'].includes(event.kind);
  if (tab === '来源')
    return (
      <div className="detail-content">
        <pre>
          {detail.source}
          {detail.line != null && `\n第 ${detail.line} 行`}
          {detail.source_key && '\n' + detail.source_key}
          {'\n' + detail.thread_id}
        </pre>
      </div>
    );
  if (tab === '计时') return <RecordTiming event={event} />;
  if (tab === '请求配置')
    return (
      <div className="detail-content">
        <Payload text={JSON.stringify(detail.request_config, null, 2)} />
      </div>
    );
  if (tab === 'Schema')
    return (
      <div className="detail-content">
        <ToolSchema detail={detail} />
      </div>
    );
  if (tab === '概述') {
    const entries = [
      ['来源', detail.provider_label],
      ...(event.layer ? [['层级', event.layer]] : []),
      ['状态', statusLabels[event.status] || event.status],
      ['引用', event.ref],
      ...(event.model ? [['模型', event.model]] : []),
      ['时长', formatRecordedDuration(event.duration_ms)],
      ...Object.entries(event.usage || {}).map(([key, value]) => [
        (
          {
            inputTokens: '输入',
            outputTokens: '输出',
            cacheReadTokens: '缓存读取',
            cacheWriteTokens: '缓存写入',
            totalTokens: 'Token',
            reasoningTokens: '思考 Token',
          } as Record<string, string>
        )[key] || key,
        String(value),
      ]),
    ];
    return (
      <>
        <dl className="overview">
          {entries.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd title={value}>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="detail-content">
          {tool ? (
            <>
              <details className="record-section" open>
                <summary>参数</summary>
                <Payload text={detail.text} />
              </details>
              <details className="record-section" open>
                <summary>结果</summary>
                {output ? (
                  <RecordContent detail={output} id={id} />
                ) : (
                  <p className="metadata-note">
                    {detail.output_available
                      ? '正在读取…'
                      : event.result_note ||
                        (event.status === 'aborted'
                          ? '调用已中止，未保存执行结果。'
                          : '此调用没有独立关联的结果。')}
                  </p>
                )}
                {output && output.pages > 1 && (
                  <button
                    className="section-title"
                    onClick={() => change('结果')}
                  >
                    查看完整结果 ›
                  </button>
                )}
              </details>
              {detail.tool_schema && (
                <details className="record-section" open>
                  <summary>Schema</summary>
                  <ToolSchema detail={detail} />
                </details>
              )}
              <details className="record-section" open>
                <summary>计时</summary>
                <RecordTiming event={event} />
              </details>
            </>
          ) : (
            <>
              <RecordContent detail={detail} id={id} />
              {detail.retries?.length ? (
                <details className="record-section">
                  <summary>请求重试 · {detail.retries.length} 次</summary>
                  <Payload text={JSON.stringify(detail.retries, null, 2)} />
                </details>
              ) : null}
            </>
          )}
          {detail.nested?.map((item) => (
            <button
              key={item.ref}
              className="nested-link"
              onClick={() => void sessionStore.selectEvent(item.ref, true)}
            >
              {item.name} · {item.ref} ›
            </button>
          ))}
        </div>
      </>
    );
  }
  return (
    <div className="detail-content">
      {tab === '结果' && !detail.output_available ? (
        <>
          <p>{event.result_note || '原始记录中没有独立关联的结果。'}</p>
          {detail.parent_ref && (
            <button
              className="nested-link"
              onClick={() =>
                void sessionStore.selectEvent(detail.parent_ref!, true)
              }
            >
              查看组合调用结果 ›
            </button>
          )}
        </>
      ) : tab === '参数' ? (
        <Payload text={detail.text} />
      ) : (
        <RecordContent detail={detail} id={id} raw={tab === '原始内容'} />
      )}
    </div>
  );
}
function ToolSchema({ detail }: { detail: Detail }) {
  return detail.tool_schema ? (
    <>
      <strong>{detail.tool_schema.name}</strong>
      {detail.tool_schema.description && (
        <p>{detail.tool_schema.description}</p>
      )}
      <Payload text={JSON.stringify(detail.tool_schema.parameters, null, 2)} />
    </>
  ) : (
    <p className="metadata-note">原始记录未保存工具 Schema。</p>
  );
}
