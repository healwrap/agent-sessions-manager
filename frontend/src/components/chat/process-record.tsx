import type { Event } from '../../lib/types';
import type { ReactNode } from 'react';
import { CodeXml } from 'lucide-react';
import { sessionStore } from '../../state/session-store';
import { Markdown } from '../markdown';
import { RecordMarkdown } from '../record-markdown';
import { Icon } from '../primitives';
import { AttachmentList } from '../detail/record-attachments';
import { Payload } from '../detail/payload';
import { ProgramInput } from '../detail/program-content';
import { RecordPages, useRecord } from './use-record';
import { useDisclosure } from './use-disclosure';
import { activityIcon, toolTitle, toolSummary } from './process-title';
import { TerminalCard } from './terminal-card';

export function ReasoningRow({
  text,
  identity,
  preview = true,
  children,
}: {
  text: string;
  identity: string;
  preview?: boolean;
  children?: ReactNode;
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
        {!open && preview && text && (
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
          <Markdown text={text} variant="compact" />
          {children}
        </div>
      )}
    </div>
  );
}

export function AssistantProcess({
  event,
  id,
  reasoningOnly = false,
  outputOnly = false,
  preview = true,
}: {
  event: Event;
  id: string;
  reasoningOnly?: boolean;
  outputOnly?: boolean;
  preview?: boolean;
}) {
  const record = useRecord(
    id,
    event,
    undefined,
    true,
    undefined,
    reasoningOnly ? 'thinking' : outputOnly ? 'output' : 'all',
  );
  const { detail } = record;
  const thinking =
    detail?.thinking_text ??
    (event.phase === 'reasoning' ? detail?.text || event.preview : '');
  const output =
    detail?.output_text ??
    (event.phase === 'reasoning' ? '' : detail?.text || event.preview);
  return (
    <div
      ref={record.ref}
      className="chat-process-message"
      data-chat-group-part={outputOnly ? 'response' : 'reasoning'}
    >
      {!outputOnly && (thinking || event.has_reasoning) && (
        <ReasoningRow
          text={thinking}
          identity={`${id}:reasoning:${event.ref}`}
          preview={preview}
        >
          {reasoningOnly && <RecordPages record={record} />}
        </ReasoningRow>
      )}
      {!reasoningOnly && output && output !== '（仅工具调用）' && (
        <RecordMarkdown text={output} detail={detail} id={id} />
      )}
      {!reasoningOnly && detail && (
        <AttachmentList detail={detail} id={id} presentation="chat" />
      )}
      {!reasoningOnly && <RecordPages record={record} />}
    </div>
  );
}

function ToolSection({
  record,
  id,
  part,
}: {
  record: ReturnType<typeof useRecord>;
  id: string;
  part?: string;
}) {
  const { detail } = record;
  return (
    <div ref={part ? record.ref : undefined} className="chat-tool-io">
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
                ? '等待读取输出…'
                : '等待读取参数…'}
          </span>
        )}
        {detail && <AttachmentList detail={detail} id={id} />}
        <RecordPages record={record} />
      </div>
    </div>
  );
}

function ToolOutput({ event, id }: { event: Event; id: string }) {
  const record = useRecord(id, event, event.output_chars, true, 'output');
  return <ToolSection record={record} id={id} part="output" />;
}

export function ToolProcess({ event, id }: { event: Event; id: string }) {
  const [open, toggle] = useDisclosure(`${id}:tool:${event.ref}`);
  const record = useRecord(
    id,
    event,
    `${event.status}:${event.output_chars}`,
    open,
  );
  const detail = record.detail;
  return (
    <div ref={record.ref} className="chat-tool-row" data-status={event.status}>
      <button className="chat-disclosure" aria-expanded={open} onClick={toggle}>
        <Icon
          name={open ? 'up' : activityIcon([event])}
          className="chat-disclosure-glyph"
        />
        <span className="chat-tool-name">{toolTitle(event)}</span>
        <i className="chat-summary-dot" />
        <span className="chat-line-preview">
          {detail?.terminal?.description || toolSummary(event)}
        </span>
      </button>
      {open && (
        <div className="chat-tool-body">
          {detail?.terminal ? (
            <TerminalCard input={detail} event={event} id={id} />
          ) : (
            <div className="chat-tool-card">
              <ToolSection record={record} id={id} />
              {detail?.output_available && <ToolOutput event={event} id={id} />}
            </div>
          )}
          <button
            type="button"
            className="chat-inspect"
            title="查看轨迹"
            aria-label={'查看轨迹 ' + event.ref}
            onClick={() => void sessionStore.selectEvent(event.ref, true)}
          >
            <CodeXml strokeWidth={1.6} /> 查看
          </button>
        </div>
      )}
    </div>
  );
}
