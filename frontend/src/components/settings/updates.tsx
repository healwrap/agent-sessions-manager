import { useEffect, useState } from 'react';
import { Download, RefreshCw, RotateCw } from 'lucide-react';
import {
  desktopUpdates,
  type AppUpdateClient,
  type AppUpdateView,
} from '../../lib/app-updates';
import { Button, BusyState, Notice, ProgressMeter, StatusBadge } from '../ui';
import { SettingsRow } from './row';
import '../../styles/app-updates.css';

const labels = {
  idle: '尚未检查',
  checking: '正在检查',
  available: '有新版本',
  current: '已是最新版本',
  unpublished: '暂未发布更新',
  downloading: '正在下载',
  ready: '可以安装',
  installing: '正在安装',
  error: '更新未完成',
};

export function UpdateSettings({
  active,
  client = desktopUpdates,
}: {
  active: boolean;
  client?: AppUpdateClient;
}) {
  const [value, setValue] = useState<AppUpdateView>();
  const [error, setError] = useState('');
  const [requesting, setRequesting] = useState(false);
  useEffect(() => {
    if (!active || !client.supported) return;
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await client.command('status');
        if (current) setValue(next);
      } catch (reason) {
        if (current) setError(String(reason));
      }
      if (current) timer = setTimeout(() => void poll(), 1000);
    };
    void poll();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [active, client]);
  const command = async (action: 'check' | 'download' | 'install') => {
    setRequesting(true);
    setError('');
    try {
      setValue(await client.command(action));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setRequesting(false);
    }
  };
  if (!client.supported) return <Notice>请在桌面应用中检查和安装更新。</Notice>;
  const busy =
    requesting ||
    ['checking', 'downloading', 'installing'].includes(value?.state || '');
  const ready = value?.state === 'ready';
  const downloadable =
    !!value?.new_version && ['available', 'error'].includes(value.state);
  return (
    <section aria-label="应用更新">
      <SettingsRow
        label="Agent Sessions"
        description={`当前版本 ${value?.current_version || '正在读取…'}`}
      >
        <StatusBadge
          tone={
            ready || value?.state === 'current'
              ? 'success'
              : value?.state === 'available'
                ? 'warning'
                : 'neutral'
          }
        >
          {labels[value?.state || 'idle']}
        </StatusBadge>
      </SettingsRow>
      {value?.new_version && (
        <SettingsRow
          label="可用版本"
          description="更新来自项目发布渠道，下载后会自动校验。"
        >
          <span>{value.new_version}</span>
        </SettingsRow>
      )}
      {value?.notes && <p className="app-update-notes">{value.notes}</p>}
      {value?.state === 'downloading' && (
        <div className="app-update-progress">
          {value.total ? (
            <>
              <span>
                已下载 {Math.round((value.downloaded / value.total) * 100)}%
              </span>
              <ProgressMeter
                label="应用更新下载进度"
                tone="normal"
                value={value.downloaded}
                max={value.total}
              />
            </>
          ) : (
            <BusyState label="正在下载更新" />
          )}
        </div>
      )}
      {ready && (
        <Notice>
          更新已下载并校验。请先停止运行中的账号环境，再安装并重启；账号数据会保留。
        </Notice>
      )}
      {(error || value?.error) && (
        <Notice tone={value?.state === 'unpublished' ? 'info' : 'error'}>
          {error || value?.error}
        </Notice>
      )}
      <div className="ui-actions app-update-actions">
        <Button disabled={busy || ready} onClick={() => void command('check')}>
          <RefreshCw size={16} />
          {value?.state === 'checking' ? '正在检查…' : '检查更新'}
        </Button>
        {downloadable && (
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void command('download')}
          >
            <Download size={16} />
            下载更新
          </Button>
        )}
        {ready && (
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void command('install')}
          >
            <RotateCw size={16} />
            安装并重启
          </Button>
        )}
      </div>
      <p className="app-update-notes">
        应用启动时会检查更新。下载和安装由你决定，运行中的账号不会因检查或下载而停止。
      </p>
    </section>
  );
}
