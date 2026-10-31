import { useMemo } from 'react';
import type { AppUpdateClient, AppUpdateView } from '../lib/app-updates';
import { UpdateSettings } from '../components/settings/updates';
import { Panel } from '../components/ui';

export function UpdatePreview() {
  const client = useMemo<AppUpdateClient>(() => {
    let value: AppUpdateView = {
      state: 'idle',
      current_version: '0.2.0',
      new_version: '',
      notes: '',
      downloaded: 0,
      total: null,
      error: '',
    };
    return {
      supported: true,
      async command(action) {
        if (action === 'check')
          value = {
            ...value,
            state: 'available',
            new_version: '0.2.1',
            notes: '示例更新：改进账号状态展示与会话自动迁移。',
          };
        if (action === 'download') {
          value = { ...value, state: 'downloading', total: 100, downloaded: 0 };
          for (let count = 1; count <= 5; count++) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            value = { ...value, downloaded: count * 20 };
          }
          value = { ...value, state: 'ready' };
        }
        if (action === 'install')
          value = {
            ...value,
            state: 'current',
            current_version: '0.2.1',
            new_version: '',
            notes: '',
            error: '',
          };
        return { ...value };
      },
    };
  }, []);
  return (
    <Panel title="应用更新（交互示例）">
      <UpdateSettings active client={client} />
    </Panel>
  );
}
