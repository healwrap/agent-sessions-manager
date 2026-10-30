import { useEffect, useRef, useState } from 'react';
import { ClipboardPaste } from 'lucide-react';
import type { Event } from '../../lib/types';
import { copyText } from '../../lib/api';
import { copyContextReference } from '../../lib/context-reference';
import { sessionStore } from '../../state/session-store';
import { Icon } from '../primitives';

function clock(raw: string) {
  if (!raw || typeof raw !== 'string') return '';
  const time = new Date(raw),
    now = new Date();
  if (!Number.isFinite(time.getTime())) return '';
  const hhmm = time.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (time.toDateString() === now.toDateString()) return hhmm;
  return `${time.getFullYear() === now.getFullYear() ? '' : time.getFullYear() + '年'}${time.getMonth() + 1}月${time.getDate()}日 ${hhmm}`;
}

export function MessageActions({
  event,
  id,
  text,
  lastUser = false,
}: {
  event: Event;
  id: string;
  text: () => Promise<string>;
  lastUser?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const pending = useRef(false),
    timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timeout.current), []);
  const user = event.kind === 'user';
  const usage = event.turn_usage;
  const total = usage
    ? [
        'inputTokens',
        'cacheReadTokens',
        'cacheWriteTokens',
        'outputTokens',
      ].reduce((sum, key) => sum + (usage[key] || 0), 0)
    : null;
  const formatted =
    total == null
      ? ''
      : total >= 1000000
        ? `${(total / 1000000).toFixed(1)}M`
        : total >= 1000
          ? `${(total / 1000).toFixed(1)}K`
          : total.toLocaleString();
  const timestamp = (
    <time className="chat-time" dateTime={event.timestamp}>
      {clock(user ? event.timestamp : event.completed_at || event.timestamp)}
    </time>
  );
  const copy = async () => {
    if (pending.current) return;
    pending.current = true;
    try {
      await copyText(await text());
      sessionStore.notify('已复制消息。', { tone: 'success' });
      setCopied(true);
      clearTimeout(timeout.current);
      timeout.current = setTimeout(() => setCopied(false), 1000);
    } catch (error) {
      sessionStore.notify(String(error), { tone: 'error' });
    } finally {
      pending.current = false;
    }
  };
  const contextReference = async () => {
    try {
      await copyContextReference(id, event.ref);
      sessionStore.notify('已复制上下文引用。', { tone: 'success' });
    } catch (error) {
      sessionStore.notify(String(error), { tone: 'error' });
    }
  };
  return (
    <div className="chat-message-actions" data-last-user={lastUser}>
      {user && timestamp}
      <button
        data-tooltip={copied ? '已复制' : '复制'}
        aria-label={'复制消息 ' + event.ref}
        onClick={() => void copy()}
      >
        <Icon name={copied ? 'check' : 'copy'} />
      </button>
      <button
        data-tooltip="查看轨迹"
        aria-label={'查看轨迹 ' + event.ref}
        onClick={() => void sessionStore.selectEvent(event.ref, true)}
      >
        <Icon name="jump" />
      </button>
      <button
        data-tooltip="复制上下文引用（从此消息开始）"
        aria-label={'复制上下文引用 ' + event.ref}
        onClick={() => void contextReference()}
      >
        <ClipboardPaste strokeWidth={1.6} />
      </button>
      {!user && (
        <span className="chat-end-info">
          {total != null && (
            <span className="chat-time" data-tooltip="本轮已记录用量">
              {formatted} tok
            </span>
          )}
          {timestamp}
        </span>
      )}
    </div>
  );
}
