import type { Detail } from '../../lib/types';
import { statusLabels } from '../../lib/types';
import { formatRecordedDuration } from '../../lib/recorded-time';
import { sessionStore } from '../../state/session-store';
import { OverviewSection } from './overview-section';
import { Payload } from './payload';
import { RecordContent } from './record-content';
import { RecordTiming } from './record-timing';
import { ToolSchema } from './tool-schema';

function sourceLabel(source: unknown) {
  if (!source || typeof source !== 'object' || Array.isArray(source))
    return '未知';
  const value = source as Record<string, unknown>;
  if (value.kind === 'user') return '用户';
  if (value.kind === 'goal')
    return typeof value.round === 'number' && value.round > 0
      ? `目标 · 第 ${value.round} 轮`
      : '目标';
  return typeof value.kind === 'string' && value.kind
    ? value.kind[0].toUpperCase() + value.kind.slice(1)
    : '未知';
}

export function DshRecordOverview({
  detail,
  output,
  id,
  change,
}: {
  detail: Detail;
  output: Detail | null;
  id: string;
  change: (tab: string) => void;
}) {
  const event = detail.event;
  const tool = event.kind === 'tool' || event.kind === 'subtool';
  const compaction = event.name === '上下文压缩';
  return (
    <>
      <dl className="overview">
        {detail.message_source !== undefined && (
          <div>
            <dt>来源</dt>
            <dd>
              <button
                className="detail-source-link"
                onClick={() => change('来源')}
              >
                {sourceLabel(detail.message_source)} ›
              </button>
            </dd>
          </div>
        )}
        {detail.hierarchy_parent_ref && (
          <div>
            <dt>层级</dt>
            <dd>
              <button
                className="detail-source-link"
                onClick={() =>
                  void sessionStore.selectEvent(
                    detail.hierarchy_parent_ref!,
                    true,
                  )
                }
              >
                {event.kind === 'subtool' ? '工具调用' : '助手消息'} ›
              </button>
            </dd>
          </div>
        )}
        <div>
          <dt>状态</dt>
          <dd>{statusLabels[event.status] || event.status}</dd>
        </div>
        {!tool && (
          <div>
            <dt>时长</dt>
            <dd>{formatRecordedDuration(event.duration_ms)}</dd>
          </div>
        )}
        {compaction && (
          <div>
            <dt>Token</dt>
            <dd>—</dd>
          </div>
        )}
      </dl>
      {compaction ? (
        <div className="detail-content">
          <RecordContent detail={detail} id={id} />
        </div>
      ) : (
        <div className="overview-sections">
          {tool ? (
            <>
              {detail.text && (
                <OverviewSection label="参数" onOpen={() => change('参数')}>
                  <Payload text={detail.text} label="参数 JSON" preview />
                </OverviewSection>
              )}
              {detail.output_available && (
                <OverviewSection label="结果" onOpen={() => change('结果')}>
                  {output ? (
                    <RecordContent detail={output} id={id} preview />
                  ) : (
                    <p className="metadata-note">正在读取…</p>
                  )}
                </OverviewSection>
              )}
              <OverviewSection label="Schema" onOpen={() => change('Schema')}>
                <ToolSchema detail={detail} preview />
              </OverviewSection>
              <OverviewSection label="计时" onOpen={() => change('计时')}>
                <RecordTiming event={event} />
              </OverviewSection>
            </>
          ) : (
            <OverviewSection label="预览" onOpen={() => change('预览')}>
              <RecordContent detail={detail} id={id} preview />
            </OverviewSection>
          )}
        </div>
      )}
    </>
  );
}
