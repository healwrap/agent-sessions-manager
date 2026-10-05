import type { Event } from '../../lib/types';
import { useId, useRef } from 'react';
import { useFollowOutput } from '../../hooks/use-follow-output';
import { Icon } from '../primitives';
import { AssistantProcess, ToolProcess } from './process-record';
import {
  activityIcon,
  activityTitle,
  liveActivityTitle,
} from './process-title';
import { useDisclosure } from './use-disclosure';

export function ProcessGroup({
  events,
  id,
  live = false,
  preview,
  liveDetail,
  grouped,
}: {
  events: Event[];
  id: string;
  live?: boolean;
  preview: boolean;
  liveDetail: boolean;
  grouped: boolean;
}) {
  const first = events[0];
  const [open, toggle] = useDisclosure(`${id}:group:${first.ref}`);
  const body = useRef<HTMLDivElement>(null);
  const bodyId = useId();
  const expanded = open || !grouped;
  useFollowOutput(body, live && expanded, events);
  const title = live ? liveActivityTitle(events) : activityTitle(events);
  const last = events.at(-1);
  const detail =
    live && liveDetail && last?.kind !== 'assistant'
      ? last?.program_summary || last?.argument_summary || ''
      : '';
  return (
    <div
      className="chat-process-group"
      data-group-expanded-mode={!grouped || undefined}
    >
      {grouped && (
        <button
          className="chat-disclosure"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
        >
          <span className="chat-process-leading" aria-hidden="true">
            <Icon
              name={activityIcon(events)}
              className="chat-process-activity"
            />
            <Icon name={open ? 'up' : 'down'} className="chat-process-toggle" />
          </span>
          <span className="chat-line-preview">
            {title}
            {detail && ` · ${detail}`}
          </span>
        </button>
      )}
      {expanded && (
        <div ref={body} id={bodyId} className="chat-process-group-body">
          <div className="chat-process-group-content">
            {events
              .filter((event) => event.kind !== 'subtool')
              .map((event) =>
                event.kind === 'assistant' ? (
                  <AssistantProcess
                    key={event.ref}
                    event={event}
                    id={id}
                    reasoningOnly
                    preview={preview}
                  />
                ) : (
                  <ToolProcess key={event.ref} event={event} id={id} />
                ),
              )}
          </div>
        </div>
      )}
    </div>
  );
}
