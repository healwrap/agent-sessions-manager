import type { CSSProperties } from 'react';
import codex from '../assets/agents/codex.svg';
import claude from '../assets/agents/claude-color.svg';
import cursor from '../assets/agents/cursor.svg';
import deepseek from '../assets/agents/deepseek-color.svg';
import antigravity from '../assets/agents/antigravity-color.svg';
import { Icon } from './primitives';

const icons: Record<string, { image: string; monochrome?: boolean }> = {
  codex: { image: codex, monochrome: true },
  claude: { image: claude },
  cursor: { image: cursor, monochrome: true },
  dsh: { image: deepseek },
  antigravity: { image: antigravity },
};

export function AgentIcon({
  source,
  monochrome = false,
}: {
  source: string;
  monochrome?: boolean;
}) {
  const icon = icons[source.split(':')[0]];
  if (!icon) return <Icon name="agents" className="agent-icon" />;
  return monochrome || icon.monochrome ? (
    <span
      className="agent-icon agent-icon-mono"
      aria-hidden="true"
      style={{ '--agent-icon-image': `url("${icon.image}")` } as CSSProperties}
    />
  ) : (
    <img className="agent-icon" src={icon.image} alt="" aria-hidden="true" />
  );
}
