import { ProgramInput, ProgramOutput } from './program-content';
import type { Detail } from '../../lib/types';
import { sessionStore } from '../../state/session-store';
import { Payload } from './payload';
import { RecordContent } from './record-content';
import { RecordTiming } from './record-timing';
import { PromptContent } from './prompt-content';
import { MessageOverview } from './message-overview';
import { RecordOverview } from './record-overview';
import { ToolSchema } from './tool-schema';

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
  const event = detail.event;
  if (detail.prompt_snapshot)
    return <PromptContent detail={detail} tab={tab} />;
  if (tab === '来源' && detail.message_source !== undefined)
    return (
      <div className="detail-content">
        {detail.message_source === undefined ? (
          <p className="metadata-note">原始记录未保存消息来源。</p>
        ) : (
          <Payload
            text={JSON.stringify(detail.message_source)}
            label="消息来源 JSON"
          />
        )}
      </div>
    );
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
  if (tab === '源码' && detail.code_program)
    return <ProgramInput program={detail.code_program} />;
  if (tab === '结果' && detail.code_program)
    return <ProgramOutput detail={detail} />;
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
  if (tab === '概述')
    return event.kind === 'assistant' ? (
      <MessageOverview detail={detail} id={id} change={change} />
    ) : (
      <RecordOverview detail={detail} output={output} id={id} change={change} />
    );
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
        <Payload text={detail.text} label="参数 JSON" />
      ) : (
        <RecordContent detail={detail} id={id} raw={tab === '原始内容'} />
      )}
    </div>
  );
}
