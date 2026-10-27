import { useEffect, useState } from 'react';
import { Fingerprint, Monitor, Network } from 'lucide-react';
import { request } from '../lib/api';
import type { DiagnosticItem } from '../lib/claude-diagnostics';
import { BrowserDiagnostics } from './browser-diagnostics';
import { DiagnosticBadge, DiagnosticCard } from './diagnostic-card';
import { DiagnosticRows } from './diagnostics-results';
import { NetworkDiagnostics } from './network-diagnostics';
import { Button } from './primitives';
import { TrajectoryLoading } from './trajectory-loading';

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
      <div className="diagnostic-target-toolbar">
        <div>
          <strong>本机 Claude App</strong>
          <p>读取实际安装信息、App 进程与配置继承情况。</p>
        </div>
        <Button variant="primary" onClick={() => void run()} disabled={running}>
          {running ? '正在检测…' : rows.length ? '重新检测' : '开始检测'}
        </Button>
      </div>
      {error && (
        <p className="diagnostic-error" role="alert">
          {error}
        </p>
      )}
      {running && (
        <TrajectoryLoading label="正在读取 Claude App 安装与进程配置…" />
      )}
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
      <nav className="main-tabs diagnostic-target-tabs" aria-label="检测对象">
        {[
          { id: 'network', title: '网络', icon: Network },
          { id: 'browser', title: '浏览器', icon: Fingerprint },
          { id: 'app', title: 'Claude App', icon: Monitor },
        ].map(({ id, title, icon: TargetIcon }) => (
          <button
            key={id}
            className={target === id ? 'active' : ''}
            aria-pressed={target === id}
            onClick={() => onTarget(id as DiagnosticTarget)}
          >
            <TargetIcon size={15} />
            {title}
          </button>
        ))}
      </nav>
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
