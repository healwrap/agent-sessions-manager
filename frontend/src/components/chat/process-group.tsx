import type { Event } from '../../lib/types';
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
        <div className="chat-process-group-body">
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
      )}
    </div>
  );
}
