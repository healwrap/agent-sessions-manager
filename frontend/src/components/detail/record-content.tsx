import { useState } from 'react';
import type { Detail } from '../../lib/types';
import { Payload } from './payload';
import { Markdown } from '../markdown';
import { sessionStore } from '../../state/session-store';

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
  if (raw) return <Payload text={detail.text} raw />;
  const assistant =
    detail.event.kind === 'assistant' && detail.thinking_text != null;
  return (
    <>
      {assistant ? (
        <>
          {detail.thinking_text && (
            <details
              key={detail.event.ref}
              className="thinking-disclosure"
              open
            >
              <summary>思考</summary>
              <Markdown text={detail.thinking_text} />
            </details>
          )}
          {detail.output_text && <Markdown text={detail.output_text} />}
          {!detail.thinking_text && !detail.output_text && <p>{detail.text}</p>}
          {detail.tool_calls?.map((call, index) => (
            <button
              key={index}
              className="nested-link assistant-tool-link"
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
              <strong>{call.name}</strong> {call.preview} {call.ref && '›'}
            </button>
          ))}
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
