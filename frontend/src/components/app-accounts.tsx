import { ScanLine } from 'lucide-react';
import type {
  AppProfile,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { AgentIcon } from './agent-icon';
import { Button } from './primitives';
import { EnvironmentProfileList } from './environment-profile-list';
export function AppAccounts({
  data,
  busy,
  onEdit,
  onDelete,
  onRuntime,
  onInspect,
}: {
  data: EnvironmentSettings;
  busy: boolean;
  onEdit: (profile: AppProfile) => void;
  onDelete: (id: string) => void;
  onRuntime: (action: 'open' | 'stop', body: { profile_id: string }) => void;
  onInspect: () => void;
}) {
  const app = data.apps.find((item) => item.id === 'claude');
  return (
    <>
      {data.app_runtime.warnings?.map((message) => (
        <p className="environment-error-bar" role="alert" key={message}>
          {message}
        </p>
      ))}
      <section className="environment-connection">
        <span className="environment-small-icon">
          <AgentIcon source="claude" />
        </span>
        <div>
          <strong>官方 Claude App</strong>
          <p>{app?.path || '请先安装官方 Claude App'}</p>
        </div>
        <Button onClick={onInspect}>
          <ScanLine size={15} />
          检查 App 环境
        </Button>
      </section>
      <EnvironmentProfileList
        data={data}
        target="app"
        busy={busy}
        onEdit={onEdit}
        onDelete={onDelete}
        onRuntime={onRuntime}
      />
      <p className="environment-footnote">
        一次使用一个 App 环境，切换时保存并退出当前环境。App
        授权登录使用系统授权窗口；与独立浏览器的登录状态分别保存。
      </p>
    </>
  );
}
