import { Download, PanelsTopLeft } from 'lucide-react';
import type { BrowserRuntimeState } from '../lib/environment-settings';
import { Button } from './primitives';
export function KernelControl({
  kernel,
  onInstall,
}: {
  kernel: BrowserRuntimeState['kernel'];
  onInstall: () => void;
}) {
  const installation = kernel.installation;
  const installing = installation?.state === 'installing';
  return (
    <section className="environment-connection kernel-control">
      <span className="environment-small-icon">
        <PanelsTopLeft size={19} />
      </span>
      <div>
        <strong>独立浏览器内核</strong>
        <p>
          {kernel.available
            ? `Fingerprint Chromium ${kernel.version} · Agent Sessions 管理`
            : '安装 Fingerprint Chromium 后即可打开隔离浏览器'}
        </p>
        {installation?.message && (
          <small>
            {installation.message}
            {installing ? ` · ${installation.progress}%` : ''}
          </small>
        )}
        {installation?.error && (
          <p className="environment-error" role="alert">
            {installation.error}
          </p>
        )}
      </div>
      <Button disabled={installing} onClick={onInstall}>
        <Download size={14} />
        {installing
          ? '安装中…'
          : kernel.available
            ? '检查内核更新'
            : '安装浏览器内核'}
      </Button>
    </section>
  );
}
