import type { Event, Settings } from '../../lib/types';
import { Icon } from '../primitives';
import { AssistantProcess, ToolProcess } from './process-record';
import { useDisclosure } from './use-disclosure';
import { turnTitle } from './process-title';
import { ProcessGroup } from './process-group';

export function Process({
  events,
  id,
  mode,
  reasoningEvent,
}: {
  events: Event[];
  id: string;
  mode: Settings['chatDetail'];
  reasoningEvent?: Event;
}) {
  const evidence = [...events, ...(reasoningEvent ? [reasoningEvent] : [])];
  const state = evidence.find((event) => event.turn_status)?.turn_status;
  const live = state === 'in_progress' || state === 'running';
  const alwaysOpen =
    live || state === 'aborted' || state === 'error' || mode === 'verbose';
  const [open, toggle] = useDisclosure(`${id}:process:${evidence[0].ref}`);
  const preview = mode !== 'compact';
  const rows = events
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
    );
  if (reasoningEvent)
    rows.push(
      <AssistantProcess
        key={reasoningEvent.ref}
        event={reasoningEvent}
        id={id}
        reasoningOnly
        preview={preview}
      />,
    );
  const expanded = open || alwaysOpen;
  const groups: Event[][] = [];
  for (const event of events) {
    const last = groups.at(-1);
    const request = event.request_number ?? event.step;
    if (
      mode === 'detailed' &&
      last &&
      request !== (last[0].request_number ?? last[0].step)
    )
      groups.push([event]);
    else if (last) last.push(event);
    else groups.push([event]);
  }
  if (!groups.length && reasoningEvent) groups.push([]);
  return (
    <div className="chat-process">
      {!live && (
        <button
          className="chat-process-summary"
          aria-expanded={expanded}
          disabled={alwaysOpen}
          onClick={toggle}
        >
          <span>{turnTitle(evidence)}</span>
          {!alwaysOpen && <Icon name="down" className="process-chevron" />}
        </button>
      )}
      {expanded && (
        <div className="chat-process-body">
          {mode === 'verbose'
            ? rows
            : groups.map((group, index) => (
                <ProcessGroup
                  key={group[0]?.ref || reasoningEvent!.ref}
                  events={group}
                  id={id}
                  preview={preview}
                  liveDetail={mode !== 'compact'}
                  live={live && index === groups.length - 1}
                  reasoningEvent={
                    index === groups.length - 1 ? reasoningEvent : undefined
                  }
                />
              ))}
        </div>
      )}
    </div>
  );
}
