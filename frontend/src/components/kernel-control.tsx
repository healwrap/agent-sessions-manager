import { Download, PanelsTopLeft } from 'lucide-react';
import type { BrowserRuntimeState } from '../lib/environment-settings';
import { Button } from './primitives';
import { StatusBadge } from './form-controls';
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
    <section className="environment-connection kernel-control">
      <span className="environment-small-icon">
        <PanelsTopLeft size={19} />
      </span>
      <div>
        <strong>独立浏览器内核</strong>{' '}
        <StatusBadge tone={kernel.available ? 'success' : 'neutral'}>
          {kernel.available ? '已安装' : '未安装'}
        </StatusBadge>
        <p>
          {kernel.available
            ? `Fingerprint Chromium ${kernel.version} · Agent Sessions 管理`
            : '安装 Fingerprint Chromium 后即可打开隔离浏览器'}
        </p>
        {installation?.message && (
          <small>
            {kernel.available && installation.state === 'failed'
              ? '更新检查失败，已安装内核可继续使用'
              : installation.message}
            {installing ? ` · ${installation.progress}%` : ''}
          </small>
        )}
        {installation?.error && (
          <p className="environment-error" role="alert">
            {installation.error}
          </p>
        )}
      </div>
      <Button
        disabled={installing || checking}
        onClick={() =>
          onInstall(kernel.available && !update ? 'check' : 'install')
        }
      >
        <Download size={14} />
        {checking
          ? '正在检查…'
          : installing
            ? '安装中…'
            : update
              ? `更新至 ${installation.version}`
              : kernel.available
                ? '检查内核更新'
                : '安装浏览器内核'}
      </Button>
    </section>
  );
}
