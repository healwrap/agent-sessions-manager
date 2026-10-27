import { useEffect, useState } from 'react';
import { Fingerprint, Monitor, Network } from 'lucide-react';
import { request } from '../lib/api';
import type { DiagnosticItem } from '../lib/claude-diagnostics';
import { BrowserDiagnostics } from './browser-diagnostics';
import { DiagnosticBadge, DiagnosticCard } from './diagnostic-card';
import { DiagnosticRows } from './diagnostics-results';
import { NetworkDiagnostics } from './network-diagnostics';
import { Button, BusyState, ChoiceGroup, Notice, SectionHeading } from './ui';

export type DiagnosticTarget = 'network' | 'browser' | 'app';

function AppDiagnostics({ active }: { active: boolean }) {
  const [rows, setRows] = useState<DiagnosticItem[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setRunning(true);
    setError('');
    try {
      setRows(
        (
          await request<{ checks: DiagnosticItem[] }>(
            '/api/environments/app-check',
          )
        ).checks,
      );
    } catch (reason) {
      setError(String(reason));
    } finally {
      setRunning(false);
    }
  };
  useEffect(() => {
    if (active && !rows.length && !running && !error) void run();
  }, [active]);
  return (
    <section aria-label="Claude App 环境检测">
      <SectionHeading
        title="本机 Claude App"
        actions={
          <Button
            variant="primary"
            onClick={() => void run()}
            disabled={running}
          >
            {running ? '正在检测' : rows.length ? '重新检测' : '开始检测'}
          </Button>
        }
      />
      {error && <Notice tone="error">{error}</Notice>}
      {running && <BusyState label="正在读取 App 安装与进程配置" />}
      {rows.length > 0 && (
        <DiagnosticCard
          title="Claude App 检测结果"
          extra={<DiagnosticBadge state="info">Claude App</DiagnosticBadge>}
        >
          <DiagnosticRows items={rows} />
        </DiagnosticCard>
      )}
    </section>
  );
}

export function EnvironmentDiagnostics({
  target,
  onTarget,
  active,
  initialProxy,
}: {
  target: DiagnosticTarget;
  onTarget: (target: DiagnosticTarget) => void;
  active: boolean;
  initialProxy?: string;
}) {
  return (
    <>
      <ChoiceGroup
        className="diagnostic-target-tabs"
        variant="tabs"
        label="检测对象"
        value={target}
        onChange={onTarget}
        items={[
          { value: 'network', label: '网络', icon: <Network size={17} /> },
          {
            value: 'browser',
            label: '浏览器',
            icon: <Fingerprint size={17} />,
          },
          { value: 'app', label: 'Claude App', icon: <Monitor size={17} /> },
        ]}
      />
      <div hidden={target !== 'network'} inert={target !== 'network'}>
        <NetworkDiagnostics
          active={active && target === 'network'}
          initialProxy={initialProxy}
        />
      </div>
      <div hidden={target !== 'browser'} inert={target !== 'browser'}>
        <BrowserDiagnostics active={active && target === 'browser'} />
      </div>
      <div hidden={target !== 'app'} inert={target !== 'app'}>
        <AppDiagnostics active={active && target === 'app'} />
      </div>
    </>
  );
}
