import { useEffect, useState } from 'react';
import { request } from '../lib/api';
import {
  checkedTime,
  routeLabel,
  type ClaudeReport,
  type DiagnosticHistory,
} from '../lib/claude-diagnostics';
import { networkChecks } from '../lib/diagnostic-labels';
import { Button, Icon } from './primitives';
import { Select } from './select';
import { TextInput } from './form-controls';
import { Disclosure } from './disclosure';
import { SettingsRow } from './settings/row';
import { TrajectoryLoading } from './trajectory-loading';
import { DiagnosticReputation } from './diagnostic-reputation';
import { DiagnosticBadge } from './diagnostic-card';
import { NetworkOverview } from './network-overview';
import {
  DiagnosticEgress,
  DiagnosticHistoryList,
  DiagnosticRows,
  DiagnosticSection,
} from './diagnostics-results';

export function NetworkDiagnostics({
  active,
  initialProxy,
}: {
  active: boolean;
  initialProxy?: string;
}) {
  const [mode, setMode] = useState('direct');
  const [proxy, setProxy] = useState('http://127.0.0.1:7897');
  const [report, setReport] = useState<ClaudeReport | null>(null);
  const [history, setHistory] = useState<DiagnosticHistory[]>([]);
  const [running, setRunning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (active && initialProxy !== undefined) {
      setMode('proxy');
      setProxy(initialProxy);
    }
  }, [active, initialProxy]);
  useEffect(() => {
    if (!active) return;
    let current = true;
    void request<{ history: DiagnosticHistory[] }>(
      '/api/claude-diagnostics/history',
    )
      .then((data) => current && setHistory(data.history))
      .catch((reason) => current && setError(String(reason)));
    return () => {
      current = false;
    };
  }, [active]);
  const run = async () => {
    setRunning(true);
    setError('');
    try {
      const result = await request<ClaudeReport>(
        '/api/claude-diagnostics/run',
        {},
        {
          mode: mode === 'lookup-proxy' ? 'direct' : mode,
          ...(mode === 'proxy'
            ? { proxy }
            : mode === 'lookup-proxy'
              ? { lookup_proxy: proxy }
              : {}),
        },
      );
      setReport(result);
      setHistory(result.history);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setRunning(false);
    }
  };
  const clearHistory = async () => {
    setClearing(true);
    setError('');
    try {
      await request('/api/claude-diagnostics/clear', {}, {});
      setHistory([]);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setClearing(false);
    }
  };
  const counts = report?.checks.reduce(
    (all, item) => ({ ...all, [item.state]: (all[item.state] || 0) + 1 }),
    {} as Record<string, number>,
  );
  return (
    <section className="diagnostic-body" aria-label="网络环境检测">
      <form
        className="diagnostic-form"
        data-mode={mode}
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <SettingsRow label="检测链路">
          <Select
            label="检测链路"
            value={mode}
            onChange={setMode}
            disabled={running}
            options={[
              { value: 'direct', label: '系统路由' },
              { value: 'proxy', label: '指定代理' },
              { value: 'lookup-proxy', label: '仅 IP 资料走代理' },
            ]}
          />
        </SettingsRow>
        {mode !== 'direct' && (
          <SettingsRow
            label={mode === 'lookup-proxy' ? 'IP 资料查询代理' : '代理地址'}
            htmlFor="diagnostic-proxy"
          >
            <TextInput
              id="diagnostic-proxy"
              className="settings-text-input"
              aria-label="检测代理地址"
              type="text"
              value={proxy}
              required
              disabled={running}
              onChange={(event) => setProxy(event.target.value)}
              placeholder="http://127.0.0.1:7897"
              spellCheck={false}
            />
          </SettingsRow>
        )}
        <div className="diagnostic-toolbar">
          <Button
            type="submit"
            variant="primary"
            icon="refresh"
            disabled={running || clearing}
          >
            {running ? '正在检测…' : report ? '重新检测' : '开始检测'}
          </Button>
        </div>
      </form>
      {error && (
        <p className="diagnostic-error" role="alert">
          {error}
        </p>
      )}
      {running && <TrajectoryLoading label="正在检测网络…" />}
      {report ? (
        <>
          <div className="diagnostic-summary">
            <div>
              <strong>最近检测</strong>
              <time>{checkedTime(report.checked_at)}</time>
              <span>{routeLabel(report.route)}</span>
            </div>
            <div className="diagnostic-summary-badges">
              <DiagnosticBadge state="pass">
                {counts?.pass || 0} 项通过
              </DiagnosticBadge>
              <DiagnosticBadge state="warn">
                {(counts?.warn || 0) + (counts?.fail || 0)} 项需关注
              </DiagnosticBadge>
              <DiagnosticBadge>{counts?.unknown || 0} 项未验证</DiagnosticBadge>
            </div>
          </div>
          <div className="diagnostic-dashboard">
            <DiagnosticEgress report={report} />
            <DiagnosticReputation report={report} />
            <NetworkOverview report={report} />
          </div>
          <Disclosure
            className="diagnostic-detail-disclosure"
            title="连接与出口明细"
          >
            <DiagnosticRows items={networkChecks(report)} />
          </Disclosure>
        </>
      ) : (
        !running && (
          <div className="diagnostic-empty">
            <Icon name="search" />
            <strong>准备检测网络环境</strong>
            <p>
              查看 Claude 域名出口、IP 信誉与网络响应。浏览器和 App
              请在各自的检测页查看。
            </p>
          </div>
        )
      )}
      <DiagnosticSection title="出口历史">
        {history.length > 0 && (
          <Button
            variant="text"
            className="diagnostic-clear"
            onClick={() => void clearHistory()}
            disabled={running || clearing}
          >
            {clearing ? '清除中…' : '清除历史'}
          </Button>
        )}
        <DiagnosticHistoryList items={history} />
      </DiagnosticSection>
    </section>
  );
}
