import { useState } from 'react';
import type { Detail } from '../../lib/types';
import { Payload } from './payload';
import { Markdown } from '../markdown';
import { sessionStore } from '../../state/session-store';
import { Icon } from '../primitives';
import { SourceBlocks } from './source-blocks';

export function AttachmentList({ detail, id }: { detail: Detail; id: string }) {
  return (
    <div className="record-attachments">
      {detail.attachments?.map((item) => {
        const query = new URLSearchParams({
          id,
          ref: detail.event.ref,
          index: String(item.index),
          part: detail.part || 'input',
        });
        return item.mediaType.startsWith('image/') ? (
          <AttachmentImage
            key={detail.event.ref + ':' + item.index + ':' + item.attachmentId}
            name={item.name || '图片'}
            src={'/api/attachment?' + query}
          />
        ) : (
          <p key={item.index} className="metadata-note">
            {item.name || '文件'} · {item.mediaType} · {item.bytes} 字节
          </p>
        );
      })}
    </div>
  );
}
function AttachmentImage({ name, src }: { name: string; src: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="record-image">
      {failed ? (
        <p className="metadata-note">图片附件无法读取：{name}</p>
      ) : (
        <a href={src} target="_blank" rel="noreferrer">
          <img
            src={src}
            alt={name}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        </a>
      )}
    </figure>
  );
}
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
  const [thinkingExpanded, setThinkingExpanded] = useState(true);
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
        <>
          {detail.thinking_text && (
            <div className="thinking-disclosure">
              <button
                type="button"
                className="thinking-toggle"
                aria-expanded={thinkingExpanded}
                onClick={() => setThinkingExpanded(!thinkingExpanded)}
              >
                思考 <Icon name="chevron" className="thinking-chevron" />
              </button>
              {thinkingExpanded && <Markdown text={detail.thinking_text} />}
            </div>
          )}
          {detail.output_text && <Markdown text={detail.output_text} />}
          {!detail.thinking_text &&
            !detail.output_text &&
            !detail.tool_calls?.length && <p>{detail.text}</p>}
          {!!detail.tool_calls?.length && (
            <ul className="assistant-tool-calls">
              {detail.tool_calls.map((call, index) => (
                <li key={index}>
                  <button
                    className="assistant-tool-link"
                    disabled={!call.ref}
                    title={
                      call.ref
                        ? '打开工具调用概述'
                        : '原始记录中没有唯一关联的工具调用'
                    }
                    onClick={() =>
                      call.ref && void sessionStore.selectEvent(call.ref, true)
                    }
                  >
                    <Icon name="wrench" className="assistant-tool-icon" />
                    <strong>{call.name}</strong>
                    <span className="assistant-tool-arguments">
                      {call.preview}
                    </span>
                    {call.ref && <Icon name="chevron" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : ['tool', 'subtool'].includes(detail.event.kind) ? (
        <Payload
          text={detail.text}
          preview={preview}
          label={detail.part === 'output' ? '结果 JSON' : '参数 JSON'}
        />
      ) : (
        <Markdown text={detail.text} />
      )}
      <AttachmentList detail={detail} id={id} />
    </>
  );
}
