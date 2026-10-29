import {
  Play,
  RefreshCw,
  ScanLine,
  SlidersHorizontal,
  Square,
} from 'lucide-react';
import type { ManagedProxy, ProxyConfig } from '../lib/environment-settings';
import type { ProxyCommand } from '../lib/proxy-config';
import { Button, IconButton, RemoveButton } from './ui';

export function ProxyActions({
  item,
  service,
  busy,
  running,
  adoptable,
  coreAvailable,
  onConfigure,
  onCommand,
  onInspect,
  onDelete,
}: {
  item: ProxyConfig;
  service?: ManagedProxy;
  busy: boolean;
  running: boolean;
  adoptable: boolean;
  coreAvailable: boolean;
  onConfigure: () => void;
  onCommand: ProxyCommand;
  onInspect: (item: ProxyConfig) => void;
  onDelete: (id: string) => void;
}) {
  const command = (action: 'start' | 'stop' | 'adopt' | 'refresh') =>
    void onCommand(action, { id: item.id }).catch(() => {});
  return (
    <>
      {service && (
        <Button
          variant="text"
          disabled={busy || (service.alive && running)}
          title={
            service.alive && running
              ? '先关闭使用此代理的环境，再停止代理'
              : undefined
          }
          onClick={() => command(service.alive ? 'stop' : 'start')}
        >
          {service.alive ? <Square size={16} /> : <Play size={16} />}
          {service.alive ? '停止' : '启动'}
        </Button>
      )}
      {adoptable && (
        <Button
          disabled={busy || running || !coreAvailable}
          onClick={() => command('adopt')}
        >
          交给应用管理
        </Button>
      )}
      <Button
        variant="text"
        disabled={busy}
        aria-label={`检测代理 ${item.name}`}
        data-guide-proxy-id={item.id}
        onClick={() => onInspect(item)}
      >
        <ScanLine size={16} />
        检测
      </Button>
      {service?.subscription && (
        <IconButton
          label={`更新订阅 ${item.name}`}
          icon={
            <RefreshCw
              size={17}
              className={
                service.subscription.status === 'updating' ? 'ui-spin' : ''
              }
            />
          }
          disabled={busy || service.subscription.status === 'updating'}
          onClick={() => command('refresh')}
        />
      )}
      <Button
        variant="text"
        disabled={busy}
        aria-label={`配置代理 ${item.name}`}
        aria-haspopup="dialog"
        onClick={onConfigure}
      >
        <SlidersHorizontal size={16} />
        配置
      </Button>
      <RemoveButton
        label={`移除代理配置 ${item.name}`}
        disabled={busy || running}
        message="移除此代理配置？绑定此代理的环境需要重新选择出口。"
        onRemove={() => onDelete(item.id)}
      />
    </>
  );
}
