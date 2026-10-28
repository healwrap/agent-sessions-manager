import { Download, LoaderCircle } from 'lucide-react';
import fingerprintIcon from '../assets/components/fingerprint-chromium.png';
import type { BrowserRuntimeState } from '../lib/environment-settings';
import { Button, Notice, ResourceCard, StatusBadge } from './ui';
export function KernelControl({
  kernel,
  onInstall,
}: {
  kernel: BrowserRuntimeState['kernel'];
  onInstall: (action: 'check' | 'install') => void;
}) {
  const installation = kernel.installation;
  const installing = installation?.state === 'installing';
  const checking = installation?.state === 'checking';
  const update = installation?.state === 'update_available';
  return (
    <ResourceCard
      className="kernel-control ui-service-strip"
      title="Fingerprint Chromium"
      subtitle={kernel.version || '独立浏览器内核'}
      icon={
        <img
          className="agent-icon"
          src={fingerprintIcon}
          alt=""
          aria-hidden="true"
        />
      }
      badge={
        <StatusBadge tone={kernel.available ? 'success' : 'neutral'}>
          {kernel.available ? '已安装' : '未安装'}
        </StatusBadge>
      }
      actions={
        <Button
          disabled={installing || checking}
          onClick={() =>
            onInstall(kernel.available && !update ? 'check' : 'install')
          }
        >
          {checking || installing ? (
            <LoaderCircle size={16} className="ui-spin" />
          ) : (
            <Download size={16} />
          )}
          {checking
            ? '正在检查'
            : installing
              ? `安装中 ${installation.progress}%`
              : update
                ? `更新至 ${installation.version}`
                : kernel.available
                  ? '检查更新'
                  : '安装内核'}
        </Button>
      }
    >
      {installation?.state === 'failed' && (
        <Notice tone={kernel.available ? 'warning' : 'error'}>
          {installation.error || installation.message}
        </Notice>
      )}
      {update && <Notice>新版本 {installation.version} 可用</Notice>}
    </ResourceCard>
  );
}
