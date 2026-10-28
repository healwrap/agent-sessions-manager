import { Download, LoaderCircle } from 'lucide-react';
import mihomoIcon from '../assets/components/mihomo.webp';
import type { ProxyRuntimeState } from '../lib/environment-settings';
import { Button, Notice, ResourceCard, StatusBadge } from './ui';

export function ProxyCoreControl({
  state,
  busy,
  onInstall,
}: {
  state?: ProxyRuntimeState;
  busy: boolean;
  onInstall: () => void;
}) {
  const core = state?.core;
  const installing = core?.installation.state === 'installing';
  return (
    <ResourceCard
      className="ui-service-strip"
      title="Mihomo"
      icon={
        <img
          className="agent-icon"
          src={mihomoIcon}
          alt=""
          aria-hidden="true"
        />
      }
      subtitle={core?.version || '专用代理内核'}
      badge={
        <StatusBadge tone={core?.available ? 'success' : 'neutral'}>
          {core?.available ? '已安装' : '未安装'}
        </StatusBadge>
      }
      actions={
        !core?.available && (
          <Button disabled={busy || installing} onClick={onInstall}>
            {installing ? (
              <LoaderCircle size={16} className="ui-spin" />
            ) : (
              <Download size={16} />
            )}
            {installing ? `安装中 ${core?.installation.progress}%` : '安装内核'}
          </Button>
        )
      }
    >
      {core?.installation.state === 'failed' && (
        <Notice tone="error">{core.installation.error}</Notice>
      )}
    </ResourceCard>
  );
}
