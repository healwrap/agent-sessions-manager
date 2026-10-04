import type { Event } from '../../lib/types';
import { Icon } from '../primitives';
import { Markdown } from '../markdown';
import { useDisclosure } from './use-disclosure';
import { RecordPages, useRecord } from './use-record';

export function Compaction({ event, id }: { event: Event; id: string }) {
  const [open, toggle] = useDisclosure(`${id}:compaction:${event.ref}`);
  const record = useRecord(id, event, null, open);
  return (
    <div ref={record.ref} className="chat-compaction">
      <button className="chat-disclosure" aria-expanded={open} onClick={toggle}>
        <Icon name="context" className="chat-disclosure-glyph" />
        <span>
          {event.status === 'running' ? '正在压缩上下文' : '上下文已压缩'}
        </span>
        {!open && <span className="chat-line-preview">{event.preview}</span>}
      </button>
      {open && (
        <div className="chat-reasoning-body">
          <Markdown text={record.detail?.text || event.preview} />
          <RecordPages record={record} />
        </div>
      )}
    </div>
  );
}
