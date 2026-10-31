import { ArrowRight, RotateCcw } from 'lucide-react';
import type {
  EnvironmentSettings,
  ProxyConfig,
} from '../lib/environment-settings';
import { fallbackChain } from '../lib/network-fallback';
import { Button, Notice } from './ui';

export type FallbackSwitch = { item: ProxyConfig; target: 'next' | 'primary' };

export function NetworkFallbackStatus({
  item,
  data,
  busy,
  onSwitch,
}: {
  item: ProxyConfig;
  data: EnvironmentSettings;
  busy: boolean;
  onSwitch: (value: FallbackSwitch) => void;
}) {
  if (!item.fallback_ids?.length) return null;
  const status = data.network?.fallbacks?.find((row) => row.id === item.id);
  const chain = fallbackChain(data.proxies, item.id);
  const current = status?.current_id || item.id;
  const index = Math.max(
    0,
    chain.findIndex((row) => row.id === current),
  );
  const warning = status?.state === 'degraded' || status?.state === 'exhausted';
  return (
    <div className="network-fallback-status">
      <p className="network-bound-accounts">
        回退顺序：{chain.map((row) => row.name).join(' → ')}
      </p>
      <div className="network-fallback-actions">
        <span>
          当前：{chain[index]?.name} ·{' '}
          {item.fallback_mode === 'automatic' ? '自动回退' : '故障提醒'}
        </span>
        <Button
          disabled={busy || !!status?.switching || index === chain.length - 1}
          onClick={() => onSwitch({ item, target: 'next' })}
        >
          <ArrowRight size={15} />
          {status?.switching ? '正在切换' : index ? '继续回退' : '切换备用'}
        </Button>
        {index > 0 && (
          <Button
            disabled={busy || !!status?.switching}
            onClick={() => onSwitch({ item, target: 'primary' })}
          >
            <RotateCcw size={15} />
            切回主节点
          </Button>
        )}
      </div>
      {status?.message && (warning || status.switching) && (
        <Notice tone={warning ? 'warning' : undefined}>{status.message}</Notice>
      )}
    </div>
  );
}
