import { useEffect, useRef, useState } from 'react';
import { ClipboardPaste } from 'lucide-react';
import type { AppState } from '../state/session-store';
import { sessionStore } from '../state/session-store';
import type { Detail, Event } from '../lib/types';
import { chatReplyRefs, requestText } from '../lib/selectors';
import { recordType } from '../lib/record-presentation';
import { copyText } from '../lib/api';
import { useHistoryScroll } from '../hooks/use-history-scroll';
import { Collapse, Icon } from './primitives';
import { Markdown } from './markdown';
function Message({
  event,
  id,
  revision,
}: {
  event: Event;
  id: string;
  revision: string | number | null;
}) {
  const [content, setContent] = useState<{
      detail: Detail;
      text: string;
      page: number;
    } | null>(null),
    [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const user = event.kind === 'user';
  useEffect(() => {
    let current = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void sessionStore
          .api<Detail>('/api/event', { id, ref: event.ref })
          .then(
            (detail) =>
              current && setContent({ detail, text: detail.text, page: 1 }),
          )
          .catch((error) => current && sessionStore.notify(String(error)));
      },
      { rootMargin: '400px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      current = false;
      observer.disconnect();
    };
  }, [id, event.ref, revision]);
  const shown = requestText(content?.text || event.preview),
    time = Date.parse(event.timestamp);
  const copy = async () => {
    try {
      const data = content || {
        ...(await sessionStore.api<Detail>('/api/event', {
          id,
          ref: event.ref,
        })),
        page: 1,
      };
      await copyText(data.text);
      sessionStore.notify(
        content && content.page < content.detail.pages
          ? '已复制当前展开的原始内容。'
          : '已复制消息。',
      );
    } catch (error) {
      sessionStore.notify(String(error));
    }
  };
  const handoff = async () => {
    try {
      const result = await sessionStore.api<{ text?: string; prompt?: string }>(
        '/api/handoff',
        { id, ref: event.ref },
      );
      await copyText(result.prompt || result.text || '');
      sessionStore.notify('已复制续接指令。');
    } catch (error) {
      sessionStore.notify(String(error));
    }
  };
  return (
    <article
      ref={ref}
      className={user ? 'chat-user-row' : 'chat-assistant-row'}
      data-message-ref={event.ref}
    >
      <div className={user ? 'chat-user-stack' : 'chat-assistant-stack'}>
        <div className={user ? 'chat-user-bubble' : 'chat-assistant-body'}>
          {user ? (
            shown.text
          ) : (
            <Markdown text={content?.text || event.preview} />
          )}
        </div>
        {user && shown.wrapped && (
          <button
            className="chat-expand"
            onClick={() => void sessionStore.selectEvent(event.ref, true)}
          >
            附带上下文与附件 ›
          </button>
        )}
        {content && content.page < content.detail.pages && (
          <button
            className="chat-expand"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void sessionStore
                .api<Detail>('/api/event', {
                  id,
                  ref: event.ref,
                  page: content.page + 1,
                })
                .then((detail) =>
                  setContent({
                    detail,
                    text: content.text + detail.text,
                    page: content.page + 1,
                  }),
                )
                .catch((error) => sessionStore.notify(String(error)))
                .finally(() => setBusy(false));
            }}
          >
            继续展开（{content.page} / {content.detail.pages} 页）
          </button>
        )}
        <div className="chat-message-actions">
          <button
            title="复制"
            aria-label={'复制消息 ' + event.ref}
            onClick={() => void copy()}
          >
            <Icon name="copy" />
          </button>
          <button
            title="查看轨迹"
            aria-label={'查看轨迹 ' + event.ref}
            onClick={() => void sessionStore.selectEvent(event.ref, true)}
          >
            <Icon name="jump" />
          </button>
          <button
            title="复制续接指令"
            aria-label={'复制续接指令 ' + event.ref}
            onClick={() => void handoff()}
          >
            <ClipboardPaste size={17} strokeWidth={1.6} />
          </button>
          <span className="chat-time">
            {Number.isFinite(time)
              ? new Date(time).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : ''}
          </span>
        </div>
      </div>
    </article>
  );
}
function Process({ events }: { events: Event[] }) {
  const [open, setOpen] = useState(false);
  const tools = events.filter((e) => e.kind === 'tool'),
    messages = events.filter((e) => e.kind === 'assistant');
  const status = events.some((e) => e.turn_status === 'in_progress')
    ? '进行中'
    : events.some((e) => e.turn_status === 'aborted')
      ? '已中止'
      : '已完成';
  return (
    <div className="chat-process">
      <button
        className="chat-process-summary flex w-full items-center border-0 bg-transparent text-left text-muted"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="down" className="process-chevron" />
        {status}
        {tools.length ? ` · 执行了 ${tools.length} 次工具调用` : ''}
        {messages.length ? ` · ${messages.length} 条过程消息` : ''}
      </button>
      <Collapse open={open}>
        <div className="chat-process-body">
          {events
            .filter((event) => event.kind !== 'subtool')
            .map((event) => (
              <button
                className="chat-process-event"
                key={event.ref}
                onClick={() => void sessionStore.selectEvent(event.ref, true)}
              >
                <span className="chat-process-kind">
                  <Icon
                    name={event.kind === 'assistant' ? 'sparkle' : 'wrench'}
                  />
                  {event.kind === 'assistant' ? '助手' : event.name}
                </span>
                <span className="chat-process-preview">{event.preview}</span>
              </button>
            ))}
        </div>
      </Collapse>
    </div>
  );
}
export function ChatPane({ state }: { state: AppState }) {
  const ref = useRef<HTMLElement>(null),
    view = state.views.chat;
  useHistoryScroll(ref, view, 'chat', state.mode === 'chat', state.id);
  const replies = chatReplyRefs(view.events, view.next !== null),
    rows = [];
  const lastReply = Array.from(replies).at(-1);
  let process: Event[] = [];
  const flush = () => {
    if (process.length) {
      rows.push(<Process key={'process:' + process[0].ref} events={process} />);
      process = [];
    }
  };
  for (const event of view.events) {
    if (event.request_only) continue;
    if (event.kind === 'user' || replies.has(event.ref)) {
      flush();
      rows.push(
        <Message
          key={state.id + event.ref}
          id={state.id!}
          event={event}
          revision={event.ref === lastReply ? view.version : null}
        />,
      );
    } else if (recordType(event) === 'compaction') {
      flush();
      rows.push(
        <button
          className="chat-compaction"
          key={event.ref}
          onClick={() => void sessionStore.selectEvent(event.ref, true)}
        >
          <Icon name="context" />
          上下文已压缩 · 查看轨迹
        </button>,
      );
    } else if (event.kind === 'media') {
      flush();
      rows.push(
        <button
          className="chat-media"
          key={event.ref}
          onClick={() => void sessionStore.selectEvent(event.ref, true)}
        >
          <Icon name="context" />
          {event.preview}
        </button>,
      );
    } else if (event.kind !== 'context') process.push(event);
  }
  flush();
  return (
    <section
      ref={ref}
      className="chat-pane"
      hidden={state.mode !== 'chat'}
      aria-label="对话记录"
    >
      <div className="chat-messages">
        {rows}
        {!rows.length && (
          <p className="empty-message">
            {view.loading
              ? '正在读取会话…'
              : view.data?.unavailable_reason || '该会话暂无对话。'}
          </p>
        )}
      </div>
    </section>
  );
}
