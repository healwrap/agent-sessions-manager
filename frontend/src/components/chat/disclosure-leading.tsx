import { Icon } from '../primitives';

// Harness DisclosureRow: the activity glyph becomes a chevron on hover/open.
export function DisclosureLeading({
  icon,
  open,
}: {
  icon: string;
  open: boolean;
}) {
  return (
    <span className="chat-disclosure-leading" aria-hidden="true">
      <Icon name={icon} className="chat-disclosure-idle" />
      <Icon name={open ? 'up' : 'down'} className="chat-disclosure-chevron" />
    </span>
  );
}
