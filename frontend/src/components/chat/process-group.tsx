import type { Event } from '../../lib/types';
import { useId } from 'react';
import { DisclosureLeading } from './disclosure-leading';
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
  const bodyId = useId();
  const expanded = open || !grouped;
  const title = live ? liveActivityTitle(events) : activityTitle(events);
  const last = events.at(-1);
  const detail =
    live && liveDetail && last?.kind !== 'assistant'
      ? last?.program_summary || last?.argument_summary || ''
      : '';
  return (
    <div className="chat-process-group" data-ungrouped={!grouped || undefined}>
      {grouped && (
        <button
          className="chat-disclosure"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
        >
          <DisclosureLeading icon={activityIcon(events)} open={open} />
          <span className="chat-line-preview">
            {title}
            {detail && ` · ${detail}`}
          </span>
        </button>
      )}
      {expanded && (
        <div id={bodyId} className="chat-process-group-body">
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
