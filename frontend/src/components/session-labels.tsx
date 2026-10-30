import type { Session, Source } from '../lib/types';
import { sourceId } from '../lib/selectors';
import { AgentIcon } from './agent-icon';

export function SessionLabels({
  item,
  sources,
  provider,
}: {
  item: Session;
  sources: Source[];
  provider: string;
}) {
  const source = sourceId(item, sources);
  const executionLabel =
    item.execution_mode === 'non_interactive'
      ? `非交互任务${item.session_source ? `（${item.session_source}）` : ''}`
      : '';
  const label = [
    !provider &&
      (sources.find((entry) => entry.id === source)?.label ||
        item.provider_label),
    item.account_name || item.environment_name,
    item.session_kind === 'subagent' && '子代理',
    executionLabel,
  ]
    .filter(Boolean)
    .join(' · ');
  if (!label) return null;
  return (
    <span className="provider-tag" data-tooltip={label}>
      {!provider && <AgentIcon source={source} />}
      <span className="provider-name">{label}</span>
    </span>
  );
}
