import { Shield, ShieldCheck, ShieldEllipsis } from 'lucide-react';
import type { RuntimeProtectionState } from '../lib/runtime-protection';
import { StatusBadge } from './form-controls';
import { Tooltip } from './ui/tooltip';

export function RuntimeProtectionBadge({
  state,
}: {
  state: RuntimeProtectionState;
}) {
  const active = state === 'active';
  const label = active ? '运行保障中' : '保障检查中';
  const Glyph = active ? ShieldCheck : ShieldEllipsis;
  return (
    <Tooltip
      label={
        active
          ? '持续检查 Claude 的网络分流与环境运行状态。'
          : '正在等待确认 Claude 的网络分流与环境运行状态。'
      }
    >
      <StatusBadge
        tone={active ? 'success' : 'warning'}
        className="runtime-protection"
        data-state={state}
        role="status"
        aria-label={label}
      >
        <span className="runtime-protection-icon" aria-hidden="true">
          {active && <Shield className="runtime-protection-halo" />}
          <Glyph className="runtime-protection-shield" />
        </span>
        <span>{label}</span>
      </StatusBadge>
    </Tooltip>
  );
}
