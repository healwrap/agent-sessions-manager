import { useEffect, useState } from 'react';
import { request } from '../lib/api';
import type { DiagnosticItem } from '../lib/claude-diagnostics';
import { DiagnosticRows } from './diagnostics-results';
import { Button, BusyState, Notice } from './ui';

export function AppDiagnostics() {
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
    void run();
  }, []);
  return (
    <section className="app-diagnostics" aria-label="App 安装与进程检查">
      <div className="ui-actions">
        <Button onClick={() => void run()} disabled={running}>
          {running ? '正在检查' : '重新检查'}
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {running && <BusyState label="正在读取 App 安装与进程配置" />}
      {rows.length > 0 && <DiagnosticRows items={rows} />}
    </section>
  );
}
