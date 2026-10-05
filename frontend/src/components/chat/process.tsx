import type { Event, Settings } from '../../lib/types';
import { Icon } from '../primitives';
import { AssistantProcess } from './process-record';
import { useDisclosure } from './use-disclosure';
import { turnTitle } from './process-title';
import { ProcessGroup } from './process-group';
import { processSegments } from './process-segments';

export function ProcessSummary({
  events,
  expanded = false,
  disabled = false,
  toggle,
}: {
  events: Event[];
  expanded?: boolean;
  disabled?: boolean;
  toggle?: () => void;
}) {
  return (
    <button
      className="chat-process-summary"
      aria-expanded={expanded}
      disabled={disabled}
      onClick={toggle}
    >
      <span>{turnTitle(events)}</span>
      {!disabled && <Icon name="down" className="process-chevron" />}
    </button>
  );
}

export function Process({
  events,
  id,
  mode,
  reasoningEvent,
  summary = true,
}: {
  events: Event[];
  id: string;
  mode: Settings['chatDetail'];
  reasoningEvent?: Event;
  summary?: boolean;
}) {
  const evidence = [...events, ...(reasoningEvent ? [reasoningEvent] : [])];
  const state = evidence.find((event) => event.turn_status)?.turn_status;
  const live = state === 'in_progress' || state === 'running';
  const alwaysOpen =
    live || state === 'aborted' || state === 'error' || mode === 'verbose';
  const [open, toggle] = useDisclosure(`${id}:process:${evidence[0].ref}`);
  const preview = mode !== 'compact';
  const expanded = open || alwaysOpen || !summary;
  const segments = processSegments(events, reasoningEvent);
  return (
    <div className="chat-process" data-scroll-anchor={evidence[0].ref}>
      {!live && summary && (
        <ProcessSummary
          events={evidence}
          expanded={expanded}
          disabled={alwaysOpen}
          toggle={toggle}
        />
      )}
      {expanded && (
        <div className="chat-process-body">
          {segments.map((segment, index) =>
            segment.kind === 'response' ? (
              <AssistantProcess
                key={`${segment.event.ref}:response`}
                event={segment.event}
                id={id}
                outputOnly
              />
            ) : (
              <ProcessGroup
                key={`${segment.events[0].ref}:group`}
                events={segment.events}
                id={id}
                preview={preview}
                grouped={mode !== 'verbose' && !(mode === 'detailed' && live)}
                liveDetail={mode === 'standard' || mode === 'detailed'}
                live={live && index === segments.length - 1}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
