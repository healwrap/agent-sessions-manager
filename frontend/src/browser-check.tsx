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
import { GateResults } from './components/browser-launch-report';
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
      document.title = pending.name + ' · 环境检测';
      if (current) setTicket(pending);
      if (pending.state === 'failed') throw new Error(pending.error);
      let result = pending;
      if (pending.state !== 'complete') {
        const checks = await inspectTargetBrowser(pending.probe_options);
        if (!current) return;
        result = await request<BrowserCheckTicket>(path, {}, { checks });
        if (current) setTicket(result);
      }
      while (current && result.launch?.state === 'checking') {
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!current) return;
        result = await request<BrowserCheckTicket>(path);
        if (current) setTicket(result);
      }
      if (
        current &&
        result.launch?.state === 'allowed' &&
        result.launch.next_url
      )
        location.assign(result.launch.next_url);
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
          {ticket?.launch
            ? '先检查这个浏览器的实际环境，通过门控后进入账号网站。'
            : '请在实际登录账号的浏览器环境打开此页，采样结果回传到本机 Agent Sessions。'}
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
            {ticket.launch
              ? ticket.launch.state === 'allowed'
                ? '启动检查通过'
                : ticket.launch.state === 'blocked'
                  ? '启动已拦截，请在 Agent Sessions 调整门控或环境后重新启动'
                  : ticket.launch.state === 'failed'
                    ? `启动失败：${ticket.launch.error}`
                    : '正在判断启动门控…'
              : '检测完成，已回传'}{' '}
            · {checkedTime(ticket.report.checked_at)}
          </p>
          {ticket.launch?.checks && (
            <DiagnosticCard title="启动门控结果">
              <GateResults checks={ticket.launch.checks} />
            </DiagnosticCard>
          )}
          <DiagnosticCard title="此独立浏览器的实际采样">
            <DiagnosticRows items={ticket.report.checks} />
          </DiagnosticCard>
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<BrowserProbePage />);
