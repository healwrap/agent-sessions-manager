import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AppState } from '../state/session-store';
import { sessionStore } from '../state/session-store';
import type { Event } from '../lib/types';
import { chatReplyRefs } from '../lib/selectors';
import { recordType } from '../lib/record-presentation';
import { useHistoryScroll } from '../hooks/use-history-scroll';
import { Icon } from './primitives';
import { Message } from './chat/message';
import { Process, ProcessSummary } from './chat/process';
import { Compaction } from './chat/compaction';
import { RecordSyncContext } from './chat/use-record';

export function ChatPane({ state }: { state: AppState }) {
  const ref = useRef<HTMLDivElement>(null),
    view = state.views.chat;
  const [width, setWidth] = useState(1068),
    [atBottom, setAtBottom] = useState(true);
  useHistoryScroll(ref, view, 'chat', state.mode === 'chat', state.id);
  useEffect(() => {
    const pane = ref.current;
    if (!pane || state.mode !== 'chat') return;
    const observer = new ResizeObserver(() => setWidth(pane.clientWidth));
    observer.observe(pane);
    const onScroll = () =>
      setAtBottom(pane.scrollHeight - pane.clientHeight - pane.scrollTop < 80);
    pane.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      observer.disconnect();
      pane.removeEventListener('scroll', onScroll);
    };
  }, [state.mode, state.id]);
  const replies = chatReplyRefs(view.events, view.next !== null),
    rows = [];
  const lastReply = Array.from(replies).at(-1);
  const lastUser = [...view.events]
    .reverse()
    .find((event) => event.kind === 'user')?.ref;
  const messageRefs = new Set(
    view.events
      .filter((event) => ['user', 'assistant'].includes(event.kind))
      .map((event) => event.ref),
  );
  let process: Event[] = [];
  const summarized = new Set<number>();
  const flush = (reasoningEvent?: Event) => {
    if (process.length || reasoningEvent) {
      const turn = (process[0] || reasoningEvent!).turn;
      rows.push(
        <Process
          key={`${state.id}:process:${process[0]?.ref || reasoningEvent!.ref}`}
          events={process}
          id={state.id!}
          mode={state.settings.chatDetail}
          reasoningEvent={reasoningEvent}
          summary={!summarized.has(turn)}
        />,
      );
      summarized.add(turn);
      process = [];
    }
  };
  for (const event of view.events) {
    if (event.request_only) continue;
    if (process.length && process[0].turn !== event.turn) flush();
    if (event.kind === 'user' || replies.has(event.ref)) {
      const ownsReasoning = replies.has(event.ref) && event.has_reasoning;
      flush(ownsReasoning ? event : undefined);
      if (
        event.kind !== 'user' &&
        !summarized.has(event.turn) &&
        ['completed', 'aborted', 'error'].includes(event.turn_status || '') &&
        Number.isFinite(event.turn_duration_ms)
      ) {
        rows.push(
          <ProcessSummary
            key={`${state.id}:status:${event.turn}`}
            events={[event]}
            disabled
          />,
        );
        summarized.add(event.turn);
      }
      rows.push(
        <Message
          key={state.id + event.ref}
          id={state.id!}
          event={event}
          revision={event.ref === lastReply ? view.version : null}
          lastUser={event.ref === lastUser}
          processOwnsReasoning={!!ownsReasoning}
        />,
      );
    } else if (recordType(event) === 'compaction') {
      flush();
      rows.push(
        <Compaction key={state.id + event.ref} event={event} id={state.id!} />,
      );
    } else if (event.kind === 'media') {
      if (event.parent_ref && messageRefs.has(event.parent_ref)) continue;
      flush();
      rows.push(
        <Message key={state.id + event.ref} event={event} id={state.id!} />,
      );
    } else if (['assistant', 'tool', 'subtool'].includes(event.kind))
      process.push(event);
  }
  flush();
  const font = state.settings.fontSize || 14;
  return (
    <section
      className="chat-frame"
      hidden={state.mode !== 'chat'}
      style={
        {
          '--dsh-chat-content-width': `${Math.max(0, Math.min(width - 64, Math.max(680, Math.min(width * 0.64, 920))))}px`,
          '--dsh-content-font-size': `${font}px`,
          '--dsh-content-font-size-secondary': `${font - (font <= 14 ? 1 : 2)}px`,
          '--dsh-content-font-delta-secondary': `${font - (font <= 14 ? 1 : 2) - 13}px`,
          '--dsh-content-font-delta': `${font - 14}px`,
        } as CSSProperties
      }
    >
      <div ref={ref} className="chat-pane" aria-label="对话记录">
        <RecordSyncContext.Provider
          value={{
            version: view.version,
            turn: view.data?.overview.at(-1)?.turn,
          }}
        >
          <div className="chat-messages">
            {view.offset > 0 && (
              <button
                className="chat-history-load"
                data-history-load="before"
                disabled={view.loading}
                onClick={() => void sessionStore.loadTrace(false, 'before')}
              >
                {view.loading ? '正在读取历史记录…' : '加载更早记录'}
              </button>
            )}
            {rows}
            {view.next === null &&
              ['in_progress', 'running'].includes(
                view.data?.current_status || '',
              ) && (
                <p className="chat-live-status" role="status">
                  <Icon name="think" /> 正在工作…
                </p>
              )}
            {view.next !== null && (
              <button
                className="chat-history-load"
                data-history-load="after"
                disabled={view.loading}
                onClick={() => void sessionStore.loadTrace(false, 'after')}
              >
                {view.loading ? '正在读取历史记录…' : '加载后续记录'}
              </button>
            )}
            {!rows.length && (
              <p className="empty-message">
                {view.loading
                  ? '正在读取会话…'
                  : view.data?.unavailable_reason || '该会话暂无对话。'}
              </p>
            )}
          </div>
        </RecordSyncContext.Provider>
      </div>
      {!atBottom && (
        <button
          className="chat-bottom"
          data-tooltip="回到底部"
          aria-label="回到底部"
          onClick={() =>
            ref.current?.scrollTo({
              top: ref.current.scrollHeight,
              behavior:
                state.settings.animations &&
                !window.matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'smooth'
                  : 'instant',
            })
          }
        >
          <Icon name="down" />
        </button>
      )}
    </section>
  );
}
