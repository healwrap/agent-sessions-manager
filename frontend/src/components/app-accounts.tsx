import type {
  AppProfile,
  BrowserAccount,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { AgentIcon } from './agent-icon';
import { Notice, ResourceCard, StatusBadge } from './ui';
import { EnvironmentProfileList } from './environment-profile-list';
export function AppAccounts({
  data,
  busy,
  loading,
  onEdit,
  onDelete,
  onRuntime,
  onLogin,
}: {
  data: EnvironmentSettings;
  busy: boolean;
  loading: boolean;
  onEdit: (profile: AppProfile) => void;
  onDelete: (id: string) => void;
  onRuntime: (action: 'open' | 'stop', body: { profile_id: string }) => void;
  onLogin: (account: BrowserAccount) => void;
}) {
  const app = data.apps.find((item) => item.id === 'claude');
  return (
    <>
      {data.app_runtime.warnings?.map((message) => (
        <Notice tone="warning" key={message}>
          {message}
        </Notice>
      ))}
      <ResourceCard
        className="environment-service ui-service-strip"
        title="官方 Claude App"
        subtitle={app?.path || '尚未安装'}
        icon={<AgentIcon source="claude" />}
        badge={
          <StatusBadge tone={app ? 'success' : 'neutral'}>
            {app ? '已安装' : '未安装'}
          </StatusBadge>
        }
      />
      <Notice>
        启动或切换账号前，自动同步各账号及本机 CLI 的全部本地 Code
        会话，可在官方 App 中继续对话。
      </Notice>
      <EnvironmentProfileList
        data={data}
        target="app"
        busy={busy}
        loading={loading}
        onEdit={onEdit}
        onDelete={onDelete}
        onRuntime={onRuntime}
        onLogin={onLogin}
      />
    </>
  );
}
