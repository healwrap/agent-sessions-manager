import { useState } from 'react';
import { ScanLine } from 'lucide-react';
import type {
  AppProfile,
  BrowserAccount,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { AgentIcon } from './agent-icon';
import { Button, Notice, ResourceCard, StatusBadge } from './ui';
import { EnvironmentProfileList } from './environment-profile-list';
import { AppDiagnostics } from './app-diagnostics';
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
  const [inspecting, setInspecting] = useState(false);
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
        actions={
          <Button
            onClick={() => setInspecting((value) => !value)}
            aria-expanded={inspecting}
          >
            <ScanLine size={15} />
            {inspecting ? '收起检查' : '检查安装与进程'}
          </Button>
        }
        footer={inspecting && <AppDiagnostics />}
      />
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
