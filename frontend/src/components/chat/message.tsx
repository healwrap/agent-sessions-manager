import type { Detail, Event } from '../../lib/types';
import { requestText } from '../../lib/selectors';
import { sessionStore } from '../../state/session-store';
import { Markdown } from '../markdown';
import { AttachmentList } from '../detail/record-attachments';
import { MessageActions } from './message-actions';
import { RecordPages, useRecord } from './use-record';
import { ReasoningRow } from './process-record';

export function Message({
  event,
  id,
  revision,
  lastUser = false,
  processOwnsReasoning = false,
}: {
  event: Event;
  id: string;
  revision?: string | number | null;
  lastUser?: boolean;
  processOwnsReasoning?: boolean;
}) {
  const record = useRecord(
      id,
      event,
      revision,
      true,
      undefined,
      event.kind === 'assistant',
    ),
    { detail } = record;
  const user = event.kind === 'user';
  // Split fields are authoritative. A blank output page may contain only thinking.
  const text = detail ? (detail.output_text ?? detail.text) : event.preview;
  const shown = requestText(text);
  const command = shown.text.match(/^(\/[a-z][a-z\d_-]*)(?=\s)/i);
  const attachments = detail && (
    <AttachmentList detail={detail} id={id} presentation="chat" />
  );
  const copyBody = async () => {
    let page =
      detail ||
      (await sessionStore.api<Detail>('/api/event', { id, ref: event.ref }));
    if (
      !user &&
      page.output_text === '' &&
      page.output_page &&
      page.output_page > page.page
    )
      page = await sessionStore.api<Detail>('/api/event', {
        id,
        ref: event.ref,
        page: page.output_page,
      });
    let body = page.output_text ?? page.text;
    while (page.page < page.pages) {
      page = await sessionStore.api<Detail>('/api/event', {
        id,
        ref: event.ref,
        page: page.page + 1,
      });
      body += page.output_text ?? page.text;
    }
    return user ? requestText(body).text : body;
  };
  return (
    <article
      ref={record.ref}
      className={user ? 'chat-user-row' : 'chat-assistant-row'}
      data-message-ref={event.ref}
    >
      <div className={user ? 'chat-user-stack' : 'chat-assistant-stack'}>
        {user && attachments}
        {!user && !processOwnsReasoning && detail?.thinking_text && (
          <ReasoningRow
            text={detail.thinking_text}
            identity={`${id}:reasoning:${event.ref}`}
          />
        )}
        {text && (
          <div className={user ? 'chat-user-bubble' : 'chat-assistant-body'}>
            {user ? (
              command ? (
                <>
                  <span className="chat-command">{command[1]}</span>
                  {shown.text.slice(command[1].length)}
                </>
              ) : (
                shown.text
              )
            ) : (
              <Markdown text={text} />
            )}
          </div>
        )}
        {!user && attachments}
        {!user && event.status === 'aborted' && (
          <span className="chat-stopped">已停止</span>
        )}
        {user && shown.wrapped && (
          <button
            className="chat-expand"
            onClick={() => void sessionStore.selectEvent(event.ref, true)}
          >
            附带上下文与附件 ›
          </button>
        )}
        <RecordPages record={record} />
        <MessageActions
          id={id}
          event={event}
          text={copyBody}
          lastUser={lastUser}
        />
      </div>
    </article>
  );
}
