import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { BrowserRun } from '../lib/environment-settings';
import { runLabels } from '../lib/environment-settings';
import { runtimeProtection } from '../lib/runtime-protection';
import {
  Button,
  ChoiceGroup,
  Panel,
  RuntimeProtectionBadge,
  StatusBadge,
} from '../components/ui';

export function StatusPreview({ onCreate }: { onCreate: () => void }) {
  const [provider, setProvider] = useState<'claude' | 'codex'>('claude');
  const [state, setState] = useState<BrowserRun['status']>('running');
  const [networkReady, setNetworkReady] = useState(true);
  const protection = runtimeProtection(
    provider,
    { status: state, alive: state === 'running', checks: [], error: '' },
    { kind: 'clash', clash_node: 'demo-claude' },
    {
      connected: networkReady,
      tun: networkReady,
      mode: 'rule',
      routing_ready: networkReady,
      current_node: 'demo-claude',
      error: '',
    },
  );
  return (
    <>
      <Panel title="按钮与状态">
        <div className="ui-actions">
          <Button variant="primary" onClick={onCreate}>
            <Plus size={16} />
            新建环境
          </Button>
          <Button variant="outline">描边按钮</Button>
          <Button variant="ghost">无底色按钮</Button>
          <Button disabled>不可用</Button>
        </div>
        <div className="catalog-statuses">
          <StatusBadge>未启动</StatusBadge>
          <StatusBadge tone="success">运行中</StatusBadge>
          <StatusBadge tone="warning">检查中</StatusBadge>
          <StatusBadge tone="error">已拦截</StatusBadge>
        </div>
      </Panel>
      <Panel title="Claude 运行保障">
        <ChoiceGroup
          label="保障预览 Agent"
          value={provider}
          onChange={(value) => setProvider(value as typeof provider)}
          items={[
            { value: 'claude', label: 'Claude' },
            { value: 'codex', label: 'Codex' },
          ]}
        />
        <ChoiceGroup
          label="保障预览运行状态"
          value={state}
          onChange={(value) => setState(value as typeof state)}
          items={[
            { value: 'running', label: '运行中' },
            { value: 'checking', label: '启动检查中' },
            { value: 'stopped', label: '已停止' },
            { value: 'blocked', label: '已拦截' },
          ]}
        />
        <div className="ui-actions">
          <Button
            aria-pressed={networkReady}
            onClick={() => setNetworkReady((value) => !value)}
          >
            {networkReady ? '模拟网络中断' : '恢复网络'}
          </Button>
          {protection ? (
            <>
              <RuntimeProtectionBadge state={protection} />
            </>
          ) : (
            <StatusBadge>{runLabels[state]}</StatusBadge>
          )}
        </div>
      </Panel>
    </>
  );
}
