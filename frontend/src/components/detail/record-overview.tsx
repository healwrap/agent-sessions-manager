import { ProgramInput, ProgramOutput } from './program-content';
import { recordType } from '../../lib/record-presentation';
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

export function RecordOverview({
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
  const compaction = recordType(event) === 'compaction';
  return (
    <>
      {detail.code_program?.description && (
        <p className="programDescription">{detail.code_program.description}</p>
      )}
      <dl className="overview">
        {(detail.message_source !== undefined || !tool) && (
          <div>
            <dt>来源</dt>
            <dd>
              <button
                className="detail-source-link"
                onClick={() => change('来源')}
              >
                {detail.message_source === undefined
                  ? detail.provider_label
                  : sourceLabel(detail.message_source)}{' '}
                ›
              </button>
            </dd>
          </div>
        )}
        {(detail.hierarchy_parent_ref || detail.parent_ref) && (
          <div>
            <dt>层级</dt>
            <dd>
              <button
                className="detail-source-link"
                onClick={() =>
                  void sessionStore.selectEvent(
                    (detail.hierarchy_parent_ref || detail.parent_ref)!,
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
              {detail.code_program ? (
                <ProgramInput
                  program={detail.code_program}
                  onOpen={() => change('源码')}
                />
              ) : (
                detail.text && (
                  <OverviewSection label="参数" onOpen={() => change('参数')}>
                    <Payload text={detail.text} label="参数 JSON" preview />
                  </OverviewSection>
                )
              )}
              {detail.code_program && output ? (
                <ProgramOutput detail={output} onOpen={() => change('结果')} />
              ) : (
                detail.output_available && (
                  <OverviewSection label="结果" onOpen={() => change('结果')}>
                    {output ? (
                      <RecordContent detail={output} id={id} preview />
                    ) : (
                      <p className="metadata-note">正在读取…</p>
                    )}
                  </OverviewSection>
                )
              )}
              {!detail.output_available &&
                (event.result_note ||
                  event.status === 'aborted' ||
                  detail.parent_ref) && (
                  <p className="metadata-note">
                    {event.result_note ||
                      (event.status === 'aborted'
                        ? '调用已中止，未保存执行结果。'
                        : '此调用没有独立关联的结果。')}
                    {detail.parent_ref && (
                      <button
                        className="nested-link"
                        onClick={() =>
                          void sessionStore.selectEvent(
                            detail.parent_ref!,
                            true,
                          )
                        }
                      >
                        查看组合调用结果 ›
                      </button>
                    )}
                  </p>
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
      )}
    </>
  );
}
