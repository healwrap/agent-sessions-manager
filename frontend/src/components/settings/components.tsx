import { useEffect, useRef, useState } from 'react';
import {
  Download,
  Globe2,
  Monitor,
  PanelsTopLeft,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { request } from '../../lib/api';
import { AgentIcon } from '../agent-icon';
import {
  Button,
  BusyState,
  ContentDialog,
  Notice,
  ResourceCard,
  StatusBadge,
} from '../ui';

type Component = {
  id: 'fingerprint' | 'mihomo' | 'claude';
  name: string;
  available: boolean;
  managed: boolean;
  removable: boolean;
  supported: boolean;
  path: string;
  version: string;
  source: string;
  installation: {
    state: string;
    progress: number;
    version?: string;
    message: string;
    error: string;
  };
};
type State = { platform: string; architecture: string; items: Component[] };
const icons = {
  fingerprint: PanelsTopLeft,
  mihomo: Globe2,
  claude: Monitor,
};

export function ComponentSettings({ active }: { active: boolean }) {
  const [data, setData] = useState<State>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Component>();
  const revision = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    if (!active) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const value = revision.current;
      try {
        const state = await request<State>('/api/components');
        if (live && value === revision.current && !pending.current)
          setData(state);
      } catch (reason) {
        if (live) setError(String(reason));
      }
      if (live) timer = setTimeout(() => void poll(), 1500);
    };
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [active]);
  const command = async (
    item: Component,
    action: 'check' | 'install' | 'remove',
  ) => {
    revision.current++;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      setData(
        await request<State>(
          '/api/components',
          {},
          {
            id: item.id,
            action,
            ...(action === 'remove' ? { path: item.path } : {}),
          },
        ),
      );
      setRemoving(undefined);
    } catch (reason) {
      setError(String(reason));
    } finally {
      revision.current++;
      pending.current = false;
      setBusy(false);
    }
  };
  if (!data)
    return error ? (
      <Notice tone="error">{error}</Notice>
    ) : (
      <BusyState label="正在读取组件" />
    );
  return (
    <div className="component-settings">
      {error && !removing && <Notice tone="error">{error}</Notice>}
      {data.items.map((item) => {
        const Symbol = icons[item.id];
        const job = item.installation;
        const working = ['checking', 'installing', 'removing'].includes(
          job.state,
        );
        const update = job.state === 'update_available';
        return (
          <ResourceCard
            key={item.id}
            title={item.name}
            icon={
              item.id === 'claude' ? (
                <AgentIcon source="claude" monochrome />
              ) : (
                <Symbol size={22} />
              )
            }
            subtitle={[item.version, item.source].filter(Boolean).join(' · ')}
            badge={
              <StatusBadge
                tone={
                  update ? 'warning' : item.available ? 'success' : 'neutral'
                }
              >
                {update ? '可更新' : item.available ? '已安装' : '未安装'}
              </StatusBadge>
            }
            actions={
              <>
                <Button
                  disabled={busy || working || !item.supported}
                  onClick={() => void command(item, 'check')}
                >
                  <RefreshCw
                    size={16}
                    className={job.state === 'checking' ? 'ui-spin' : ''}
                  />
                  检查更新
                </Button>
                <Button
                  variant={item.available ? 'secondary' : 'primary'}
                  disabled={busy || working || !item.supported}
                  onClick={() => void command(item, 'install')}
                  title={
                    item.id === 'claude' &&
                    item.available &&
                    !item.managed &&
                    data.platform === 'macOS'
                      ? '将官方 Claude 另存为应用管理的独立副本'
                      : undefined
                  }
                >
                  <Download size={16} />
                  {working
                    ? '处理中…'
                    : item.managed
                      ? update
                        ? '更新'
                        : '重新安装'
                      : item.available
                        ? data.platform === 'Windows' && item.id === 'claude'
                          ? '接管并更新'
                          : '安装独立副本'
                        : '安装'}
                </Button>
                {item.removable && (
                  <Button
                    disabled={busy || working}
                    onClick={() => {
                      setError('');
                      setRemoving(item);
                    }}
                  >
                    <Trash2 size={16} />
                    卸载
                  </Button>
                )}
              </>
            }
          >
            {item.path && <code className="component-path">{item.path}</code>}
            {!item.supported && (
              <Notice>此架构暂时没有适用的 Fingerprint Chromium 发行包</Notice>
            )}
            {working && (
              <div role="status">
                {job.message}
                {job.state === 'installing' ? ` · ${job.progress}%` : ''}
              </div>
            )}
            {job.error && <Notice tone="error">{job.error}</Notice>}
            {job.state === 'idle' && job.progress === 100 && (
              <div role="status">{job.message}</div>
            )}
          </ResourceCard>
        );
      })}
      {removing && (
        <ContentDialog
          title={`卸载 ${removing.name}`}
          busy={busy}
          onClose={() => setRemoving(undefined)}
          footer={
            <>
              <Button disabled={busy} onClick={() => setRemoving(undefined)}>
                取消
              </Button>
              <Button
                disabled={busy}
                variant="outline"
                className="ui-danger"
                onClick={() => void command(removing, 'remove')}
              >
                确认卸载
              </Button>
            </>
          }
        >
          <p>
            {removing.managed
              ? '卸载以下受管组件。'
              : data.platform === 'macOS'
                ? '将以下本机应用移入废纸篓。'
                : '使用 Windows 卸载以下本机应用。'}
            保留本应用中的账号、环境配置与独立登录数据。
          </p>
          <code className="component-path">{removing.path}</code>
          {data.platform === 'Windows' && removing.id === 'claude' && (
            <p>
              Windows 卸载器可能清除 Claude
              自身的本地应用数据。本应用保存的独立账号与环境数据仍会保留。
            </p>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </ContentDialog>
      )}
    </div>
  );
}
