import { useEffect, useState } from 'react';
import { request } from '../lib/api';
import {
  checkedTime,
  inspectDiagnosticWindow,
  routeLabel,
  type ClaudeReport,
  type DiagnosticHistory,
  type DiagnosticItem,
} from '../lib/claude-diagnostics';
import { AgentIcon } from './agent-icon';
import { ResourceLink } from './resource-link';
import { networkChecks } from '../lib/diagnostic-labels';
import { Button, Dialog, Icon, IconButton } from './primitives';
import { Select } from './select';
import { SettingsRow } from './settings/row';
import { TrajectoryLoading } from './trajectory-loading';
import { DiagnosticReputation } from './diagnostic-reputation';
import {
  DiagnosticEgress,
  DiagnosticHistoryList,
  DiagnosticRows,
  DiagnosticSection,
} from './diagnostics-results';

export function ClaudeDiagnostics({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState('direct');
  const [proxy, setProxy] = useState('http://127.0.0.1:7897');
  const [report, setReport] = useState<ClaudeReport | null>(null);
  const [windowChecks, setWindowChecks] = useState<DiagnosticItem[]>([]);
  const [history, setHistory] = useState<DiagnosticHistory[]>([]);
  const [running, setRunning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let current = true;
    void request<{ history: DiagnosticHistory[] }>(
      '/api/claude-diagnostics/history',
    )
      .then((data) => current && setHistory(data.history))
      .catch((reason) => current && setError(String(reason)));
    return () => {
      current = false;
    };
  }, [open]);
  const run = async () => {
    setRunning(true);
    setError('');
    try {
      const [result, device] = await Promise.all([
        request<ClaudeReport>(
          '/api/claude-diagnostics/run',
          {},
          { mode, ...(mode === 'proxy' ? { proxy } : {}) },
        ),
        inspectDiagnosticWindow(),
      ]);
      setReport(result);
      setWindowChecks(device);
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
    <Dialog
      open={open}
      onClose={onClose}
      id="claude-diagnostics"
      title="Claude 检测"
    >
      <header className="diagnostic-header">
        <div>
          <AgentIcon source="claude:local" />
          <h2>Claude 检测</h2>
        </div>
        <IconButton icon="close" label="关闭 Claude 检测" onClick={onClose} />
      </header>
      <div className="diagnostic-body">
        <p className="diagnostic-intro">
          检查出口、Claude 连通性和本机环境。选择检测链路后开始采样。
        </p>
        <form
          className="diagnostic-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          <SettingsRow
            label="检测链路"
            description={
              mode === 'direct'
                ? '遵循系统路由，不读取 HTTP、PAC 或环境变量代理。'
                : '仅本次检测使用指定代理，不修改系统或 Claude 的配置。'
            }
          >
            <Select
              label="检测链路"
              value={mode}
              onChange={setMode}
              disabled={running}
              options={[
                { value: 'direct', label: '系统路由' },
                { value: 'proxy', label: '指定代理' },
              ]}
            />
          </SettingsRow>
          {mode === 'proxy' && (
            <SettingsRow
              label="代理地址"
              htmlFor="diagnostic-proxy"
              description="支持 HTTP、HTTPS 和 SOCKS5h"
            >
              <input
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
        {running && (
          <TrajectoryLoading label="正在检查出口、网络连接与当前窗口，通常需要 10–25 秒。" />
        )}
        {report ? (
          <>
            <div className="diagnostic-summary">
              <div>
                <strong>最近检测</strong>
                <time>{checkedTime(report.checked_at)}</time>
                <span>{routeLabel(report.route)}</span>
              </div>
              <div>
                {counts?.pass || 0} 项通过 ·{' '}
                {(counts?.warn || 0) + (counts?.fail || 0)} 项需关注 ·{' '}
                {counts?.unknown || 0} 项未验证
              </div>
            </div>
            <DiagnosticSection
              title="网络出口"
              note="从 Agent Sessions 后台通过所选链路采样。"
            >
              <DiagnosticEgress report={report} />
            </DiagnosticSection>
            <DiagnosticSection title="IP 信誉与网络类型">
              <DiagnosticReputation value={report.ip_reputation} />
            </DiagnosticSection>
            <DiagnosticSection title="连接与出口检查">
              <DiagnosticRows items={networkChecks(report)} />
            </DiagnosticSection>
            <DiagnosticSection
              title="本机 Claude 与网络配置"
              note="只读检查，不启动、退出或修改其他应用。"
            >
              <DiagnosticRows items={report.local_checks} />
            </DiagnosticSection>
            <DiagnosticSection
              title="当前窗口环境"
              note="以下是 Agent Sessions 窗口的实际值，不代表 Claude App 或其他浏览器。WebRTC 使用 Google STUN 采样。"
            >
              <DiagnosticRows items={windowChecks} />
            </DiagnosticSection>
          </>
        ) : (
          !running && (
            <div className="diagnostic-empty">
              <Icon name="search" />
              <strong>准备检测 Claude 使用环境</strong>
              <p>
                查看域名出口、网络响应、配置隔离，以及当前窗口的语言、时区和指纹。
              </p>
            </div>
          )
        )}
        <DiagnosticSection
          title="出口历史"
          note="最近 30 次记录仅保存在本机；按检测链路比较出口变化。"
        >
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
        <p className="diagnostic-reference">
          项目分类参考{' '}
          <ResourceLink href="https://ip.net.coffee/claude/">
            Net.Coffee Claude 检测
          </ResourceLink>
          ；本页独立发起检测。
        </p>
      </div>
    </Dialog>
  );
}
