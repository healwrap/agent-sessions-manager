import { useState } from 'react';
import type { Detail } from '../../lib/types';
import { Payload } from './payload';
import { RecordMarkdown } from '../record-markdown';
import { sessionStore } from '../../state/session-store';
import { Icon } from '../primitives';
import { SourceBlocks } from './source-blocks';
import { AttachmentList } from './record-attachments';
export function RecordContent({
  detail,
  id,
  raw = false,
  preview = false,
}: {
  detail: Detail;
  id: string;
  raw?: boolean;
  preview?: boolean;
}) {
  const recordKey = `${id}:${detail.event.ref}`;
  const [thinkingDisclosure, setThinkingDisclosure] = useState<{
    recordKey: string;
    expanded: boolean;
  } | null>(null);
  const thinkingExpanded =
    thinkingDisclosure?.recordKey === recordKey
      ? thinkingDisclosure.expanded
      : true;
  if (raw)
    return detail.source_blocks?.length ? (
      <SourceBlocks detail={detail} />
    ) : (
      <Payload text={detail.text} raw />
    );
  const assistant =
    detail.event.kind === 'assistant' && detail.thinking_text != null;
  return (
    <>
      {assistant ? (
        <div className="assistant-content">
          {detail.thinking_text && (
            <div
              className="thinking-disclosure"
              data-only-preview={(preview && !detail.output_text) || undefined}
            >
              <button
                type="button"
                className="thinking-toggle"
                aria-expanded={thinkingExpanded}
                onClick={() =>
                  setThinkingDisclosure({
                    recordKey,
                    expanded: !thinkingExpanded,
                  })
                }
              >
                思考 <Icon name="right" className="thinking-chevron" />
              </button>
              {thinkingExpanded && (
                <div className="thinking-content">
                  <RecordMarkdown
                    text={detail.thinking_text}
                    detail={detail}
                    id={id}
                    variant="compact"
                  />
                </div>
              )}
            </div>
          )}
          {detail.output_text && (
            <div className="assistant-output">
              <RecordMarkdown
                text={detail.output_text}
                detail={detail}
                id={id}
              />
            </div>
          )}
          {!detail.thinking_text &&
            !detail.output_text &&
            !detail.tool_calls?.length && <p>{detail.text}</p>}
          {!!detail.tool_calls?.length && (
            <ul
              className={`assistant-tool-calls${preview ? ' assistant-tool-calls-preview' : ''}`}
            >
              {detail.tool_calls.map((call, index) => (
                <li key={index}>
                  <button
                    type="button"
                    className="assistant-tool-link"
                    disabled={!call.ref}
                    data-tooltip={
                      call.ref
                        ? '打开工具调用概述'
                        : '原始记录中没有唯一关联的工具调用'
                    }
                    onClick={() =>
                      call.ref && void sessionStore.selectEvent(call.ref, true)
                    }
                  >
                    <Icon name="tool-call" className="assistant-tool-icon" />
                    <span className="assistant-tool-text">
                      <span
                        className="assistant-tool-name"
                        data-tooltip={call.name}
                      >
                        {call.name}
                      </span>
                      {call.preview && (
                        <span className="assistant-tool-arguments">
                          {call.preview}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : ['tool', 'subtool'].includes(detail.event.kind) ? (
        <Payload
          text={detail.text}
          preview={preview}
          label={detail.part === 'output' ? '结果 JSON' : '参数 JSON'}
        />
      ) : (
        <RecordMarkdown text={detail.text} detail={detail} id={id} />
      )}
      <AttachmentList detail={detail} id={id} />
    </>
  );
}
