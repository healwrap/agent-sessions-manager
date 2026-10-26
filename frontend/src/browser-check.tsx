import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Fingerprint } from 'lucide-react';
import { request } from './lib/api';
import { checkedTime } from './lib/claude-diagnostics';
import {
  inspectTargetBrowser,
  type BrowserCheckTicket,
} from './lib/browser-check';
import { DiagnosticRows } from './components/diagnostics-results';
import { DiagnosticCard } from './components/diagnostic-card';
import { TrajectoryLoading } from './components/trajectory-loading';
import './styles/index.css';
import './styles/browser-check.css';

function BrowserProbePage() {
  const [ticket, setTicket] = useState<BrowserCheckTicket>();
  const [error, setError] = useState('');
  const [running, setRunning] = useState(true);
  useEffect(() => {
    let current = true;
    const token = new URLSearchParams(location.search).get('ticket');
    const run = async () => {
      if (!token)
        throw new Error('请从 Agent Sessions 的浏览器检测页生成专用链接。');
      const path = '/api/browser-checks/' + encodeURIComponent(token);
      const pending = await request<BrowserCheckTicket>(path);
      if (current) setTicket(pending);
      if (pending.state === 'complete') return;
      const checks = await inspectTargetBrowser();
      const result = await request<BrowserCheckTicket>(path, {}, { checks });
      if (current) setTicket(result);
    };
    void run()
      .catch((reason) => current && setError(String(reason)))
      .finally(() => current && setRunning(false));
    return () => {
      current = false;
    };
  }, []);
  return (
    <main className="browser-probe-page">
      <div className="browser-probe-intro">
        <Fingerprint size={28} />
        <h1>独立浏览器环境检测</h1>
        <p>目标：{ticket?.name || '正在连接…'}</p>
        <p>
          请在实际登录 Claude
          的浏览器环境打开此页。采样来自本页所在浏览器，结果回传到本机 Agent
          Sessions。
        </p>
      </div>
      {error && (
        <p role="alert" className="diagnostic-error">
          {error}
        </p>
      )}
      {running && (
        <TrajectoryLoading label="正在采样这个浏览器的实际环境与网络出口…" />
      )}
      {ticket?.state === 'complete' && ticket.report && (
        <>
          <p role="status" className="browser-probe-success">
            检测完成，已回传 · {checkedTime(ticket.report.checked_at)}。可以返回
            Claude 标签页。
          </p>
          <DiagnosticCard title="此独立浏览器的实际采样">
            <DiagnosticRows items={ticket.report.checks} />
          </DiagnosticCard>
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<BrowserProbePage />);
