import type { Event } from '../../lib/types';
import { sessionStore } from '../../state/session-store';
import { Markdown } from '../markdown';
import { Icon } from '../primitives';
import { AttachmentList } from '../detail/record-attachments';
import { Payload } from '../detail/payload';
import { ProgramInput } from '../detail/program-content';
import { RecordPages, useRecord } from './use-record';
import { useDisclosure } from './use-disclosure';
import { activityIcon, toolTitle, toolSummary } from './process-title';

export function ReasoningRow({
  text,
  identity,
  preview = true,
}: {
  text: string;
  identity: string;
  preview?: boolean;
}) {
  const [open, setOpen] = useDisclosure(identity);
  return (
    <div className="chat-reasoning">
      <button
        className="chat-disclosure"
        aria-expanded={open}
        onClick={setOpen}
      >
        <Icon name="think" className="chat-disclosure-glyph" />
        <span>思考</span>
        {!open && preview && (
          <>
            <i className="chat-summary-dot" />
            <span className="chat-line-preview">
              {text
                .split('\n')
                .find((line) => line.trim())
                ?.replace(/\*\*/g, '')}
            </span>
          </>
        )}
      </button>
      {open && (
        <div className="chat-reasoning-body">
          <Markdown text={text} />
        </div>
      )}
    </div>
  );
}

export function AssistantProcess({
  event,
  id,
  reasoningOnly = false,
  preview = true,
}: {
  event: Event;
  id: string;
  reasoningOnly?: boolean;
  preview?: boolean;
}) {
  const record = useRecord(id, event),
    { detail } = record;
  const thinking =
    detail?.thinking_text ??
    (event.phase === 'reasoning' ? detail?.text || event.preview : '');
  const output =
    detail?.output_text ??
    (event.phase === 'reasoning' ? '' : detail?.text || event.preview);
  return (
    <div ref={record.ref} className="chat-process-message">
      {thinking && (
        <ReasoningRow
          text={thinking}
          identity={`${id}:reasoning:${event.ref}`}
          preview={preview}
        />
      )}
      {!reasoningOnly && output && output !== '（仅工具调用）' && (
        <Markdown text={output} />
      )}
      {!reasoningOnly && detail && (
        <AttachmentList detail={detail} id={id} presentation="chat" />
      )}
      <RecordPages record={record} />
    </div>
  );
}

function ToolSection({
  event,
  id,
  part,
}: {
  event: Event;
  id: string;
  part?: string;
}) {
  const record = useRecord(id, event, null, true, part),
    { detail } = record;
  return (
    <div ref={record.ref} className="chat-tool-io">
      <span className="chat-tool-io-label">{part ? '输出' : '输入'}</span>
      <div className="chat-tool-io-body">
        {detail ? (
          detail.code_program && !part ? (
            <ProgramInput program={detail.code_program} />
          ) : (
            <Payload
              text={detail.text}
              label={part ? '结果 JSON' : '参数 JSON'}
              preview
            />
          )
        ) : (
          <span>
            {record.busy
              ? '正在读取…'
              : part
                ? event.output_preview || '无输出'
                : event.preview}
          </span>
        )}
        {detail && <AttachmentList detail={detail} id={id} />}
        <RecordPages record={record} />
      </div>
    </div>
  );
}

export function ToolProcess({ event, id }: { event: Event; id: string }) {
  const [open, toggle] = useDisclosure(`${id}:tool:${event.ref}`);
  return (
    <div className="chat-tool-row" data-status={event.status}>
      <button className="chat-disclosure" aria-expanded={open} onClick={toggle}>
        <Icon name={activityIcon([event])} className="chat-disclosure-glyph" />
        <span className="chat-tool-name">{toolTitle(event)}</span>
        <i className="chat-summary-dot" />
        <span className="chat-line-preview">{toolSummary(event)}</span>
      </button>
      {open && (
        <>
          <div className="chat-tool-card">
            <ToolSection event={event} id={id} />
            {['completed', 'error', 'result', 'aborted'].includes(
              event.status,
            ) && <ToolSection event={event} id={id} part="output" />}
          </div>
          <button
            className="chat-inspect"
            onClick={() => void sessionStore.selectEvent(event.ref, true)}
          >
            查看轨迹 <Icon name="jump" />
          </button>
        </>
      )}
    </div>
  );
}
