import { useEffect, useState } from 'react';
import { Fingerprint, Monitor, Network } from 'lucide-react';
import { request } from '../lib/api';
import {
  inspectDiagnosticWindow,
  type DiagnosticItem,
} from '../lib/claude-diagnostics';
import { DiagnosticBadge, DiagnosticCard } from './diagnostic-card';
import { DiagnosticRows } from './diagnostics-results';
import { NetworkDiagnostics } from './network-diagnostics';
import { Button } from './primitives';
import { TrajectoryLoading } from './trajectory-loading';

export type DiagnosticTarget = 'network' | 'browser' | 'app';

function TargetDiagnostics({
  target,
  active,
}: {
  target: 'browser' | 'app';
  active: boolean;
}) {
  const [rows, setRows] = useState<DiagnosticItem[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setRunning(true);
    setError('');
    try {
      setRows(
        target === 'browser'
          ? await inspectDiagnosticWindow()
          : (
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
    if (active && target === 'app' && !rows.length && !running && !error)
      void run();
  }, [active]);
  const browser = target === 'browser';
  return (
    <section aria-label={browser ? '浏览器环境检测' : 'Claude App 环境检测'}>
      <div className="diagnostic-target-toolbar">
        <div>
          <strong>
            {browser ? '当前 Agent Sessions 窗口' : '本机 Claude App'}
          </strong>
          <p>
            {browser
              ? '采样来自当前窗口；独立浏览器环境尚未连接。'
              : '读取实际安装信息、App 进程与配置继承情况。'}
          </p>
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
        <TrajectoryLoading
          label={
            browser
              ? '正在采样窗口语言、时区、指纹与 WebRTC…'
              : '正在读取 Claude App 安装与进程配置…'
          }
        />
      )}
      {rows.length > 0 && (
        <DiagnosticCard
          title={browser ? '浏览器采样结果' : 'Claude App 检测结果'}
          extra={
            <DiagnosticBadge state="info">
              {browser ? 'Agent Sessions 窗口' : 'Claude App'}
            </DiagnosticBadge>
          }
        >
          <DiagnosticRows items={rows} />
        </DiagnosticCard>
      )}
      {browser && !rows.length && !running && (
        <div className="diagnostic-empty">
          <Fingerprint size={25} />
          <strong>检测当前窗口的实际环境</strong>
          <p>包含语言、时区、浏览器标识、Canvas / WebGL 和 WebRTC 候选地址。</p>
        </div>
      )}
      <p className="diagnostic-note">
        {browser
          ? '此处不代表 CCBaga 或 Claude App 的浏览器状态。DNS / WebRTC 公网泄漏判定仍待接入。'
          : 'App 实际网络出口、运行时语言与时区尚未采样，结果中分别标为未验证。'}
      </p>
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
        <TargetDiagnostics
          target="browser"
          active={active && target === 'browser'}
        />
      </div>
      <div hidden={target !== 'app'} inert={target !== 'app'}>
        <TargetDiagnostics target="app" active={active && target === 'app'} />
      </div>
    </>
  );
}
