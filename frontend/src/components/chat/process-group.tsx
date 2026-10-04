import type { Event } from '../../lib/types';
import { useRef } from 'react';
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
  reasoningEvent,
}: {
  events: Event[];
  id: string;
  live?: boolean;
  preview: boolean;
  liveDetail: boolean;
  reasoningEvent?: Event;
}) {
  const first = events[0] || reasoningEvent!;
  const [open, toggle] = useDisclosure(`${id}:group:${first.ref}`);
  const body = useRef<HTMLDivElement>(null);
  useFollowOutput(body, live && (open || liveDetail), events);
  return (
    <div className="chat-process-group">
      <button
        className="chat-disclosure"
        aria-expanded={open || live}
        disabled={live}
        onClick={toggle}
      >
        <Icon name={activityIcon(events)} className="chat-disclosure-glyph" />
        <span>{live ? liveActivityTitle(events) : activityTitle(events)}</span>
      </button>
      {(open || (live && liveDetail)) && (
        <div ref={body} className="chat-process-group-body">
          <div className="chat-process-group-content">
            {events
              .filter((event) => event.kind !== 'subtool')
              .map((event) =>
                event.kind === 'assistant' ? (
                  <AssistantProcess
                    key={event.ref}
                    event={event}
                    id={id}
                    preview={preview}
                  />
                ) : (
                  <ToolProcess key={event.ref} event={event} id={id} />
                ),
              )}
            {reasoningEvent && (
              <AssistantProcess
                event={reasoningEvent}
                id={id}
                reasoningOnly
                preview={preview}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
