import type { Detail } from '../../lib/types';
import { statusLabels } from '../../lib/types';
import { sessionStore } from '../../state/session-store';
import { OverviewSection } from './overview-section';
import { Payload } from './payload';
import { RecordTiming } from './record-timing';

function Usage({ usage }: { usage?: Record<string, number> }) {
  if (!usage) return <p className="metadata-note">未记录用量。</p>;
  const input =
    usage.inputTokens != null ||
    usage.cacheReadTokens != null ||
    usage.cacheWriteTokens != null
      ? (usage.inputTokens ?? 0) +
        (usage.cacheReadTokens ?? 0) +
        (usage.cacheWriteTokens ?? 0)
      : undefined;
  const content =
    usage.outputTokens != null && usage.reasoningTokens != null
      ? usage.outputTokens - usage.reasoningTokens
      : undefined;
  const rows = [
    ['输入', input],
    ['缓存读取', usage.cacheReadTokens],
    ['缓存写入', usage.cacheWriteTokens],
    ['其他', usage.inputTokens],
    ['输出', usage.outputTokens],
    ['思考', usage.reasoningTokens],
    ['正文', content],
  ].filter((row) => row[1] != null);
  return (
    <dl className="overview">
      {rows.map(([label, count]) => (
        <div
          key={label}
          className={
            ['缓存读取', '缓存写入', '其他', '思考', '正文'].includes(
              String(label),
            )
              ? 'requestTokenDetail'
              : ''
          }
        >
          <dt>{label}</dt>
          <dd>{Number(count).toLocaleString()} tok</dd>
        </div>
      ))}
    </dl>
  );
}

export function RequestContent({
  detail,
  tab,
  change,
}: {
  detail: Detail;
  tab: string;
  change: (tab: string) => void;
}) {
  const event = detail.event;
  const compaction = event.name === '上下文压缩';
  const options = detail.request_config;
  if (tab === '选项')
    return (
      <div className="detail-content">
        <Payload
          text={JSON.stringify(options ?? {}, null, 2)}
          label="请求选项 JSON"
        />
      </div>
    );
  if (tab === '用量')
    return (
      <div className="request-usage-panel">
        <section>
          <h4>本次请求</h4>
          <Usage usage={event.usage} />
        </section>
        <section>
          <h4>会话累计</h4>
          <Usage usage={event.request_cumulative_usage} />
        </section>
      </div>
    );
  if (tab === '计时') return <RecordTiming event={event} request />;
  return (
    <>
      <dl className="overview">
        <div>
          <dt>状态</dt>
          <dd>{statusLabels[event.status] || event.status}</dd>
        </div>
        {compaction && (
          <div>
            <dt>用途</dt>
            <dd>压缩</dd>
          </div>
        )}
        {event.model_provider && (
          <div>
            <dt>提供方</dt>
            <dd>{event.model_provider}</dd>
          </div>
        )}
        {event.model && (
          <div>
            <dt>模型</dt>
            <dd>{event.model}</dd>
          </div>
        )}
        <div>
          <dt>工具调用</dt>
          <dd>{detail.request_tool_calls ?? detail.tool_calls?.length ?? 0}</dd>
        </div>
        {!!detail.request_subtool_calls && (
          <div>
            <dt>子工具调用</dt>
            <dd>{detail.request_subtool_calls}</dd>
          </div>
        )}
        <div>
          <dt>结果</dt>
          <dd>
            <button
              className="detail-source-link"
              onClick={() =>
                void sessionStore.selectEvent(event.ref, false, false)
              }
            >
              {compaction ? '压缩后上下文' : '助手消息'} ›
            </button>
          </dd>
        </div>
      </dl>
      <div className="overview-sections">
        {options && (
          <OverviewSection label="选项" onOpen={() => change('选项')}>
            <Payload
              text={JSON.stringify(options)}
              label="请求选项 JSON"
              preview
            />
          </OverviewSection>
        )}
        <OverviewSection label="用量" onOpen={() => change('用量')}>
          <Usage usage={event.usage} />
        </OverviewSection>
        <OverviewSection label="计时" onOpen={() => change('计时')}>
          <RecordTiming event={event} request />
        </OverviewSection>
      </div>
    </>
  );
}
