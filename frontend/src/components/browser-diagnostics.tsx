import { useEffect, useState } from 'react';
import { Fingerprint, Link2, PanelsTopLeft } from 'lucide-react';
import { copyText, request } from '../lib/api';
import type { BrowserCheckTicket } from '../lib/browser-check';
import { checkedTime } from '../lib/claude-diagnostics';
import { browserAvailable } from '../lib/environment-settings';
import { GateResults } from './browser-launch-report';
import { useEnvironmentSettings } from '../hooks/use-environment-settings';
import { DiagnosticBadge, DiagnosticCard } from './diagnostic-card';
import { DiagnosticRows } from './diagnostics-results';
import { Button } from './primitives';
import { Select } from './select';
import { SettingsRow } from './settings/row';
import '../styles/browser-check.css';

export function BrowserDiagnostics({ active }: { active: boolean }) {
  const {
    data,
    loading,
    error: environmentError,
  } = useEnvironmentSettings(active, false);
  const [target, setTarget] = useState('');
  const [ticket, setTicket] = useState<BrowserCheckTicket>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const selected =
    target ||
    (data.profiles[0] ? 'profile:' + data.profiles[0].id : 'external');
  const profile = data.profiles.find((row) => 'profile:' + row.id === selected);
  const managed = !!profile;
  const create = async () => {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      setTicket(
        await request<BrowserCheckTicket>(
          managed ? '/api/browser-runtime/check' : '/api/browser-checks/start',
          {},
          managed ? { profile_id: profile.id } : { target: selected },
        ),
      );
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!active || busy || !ticket || ticket.state !== 'waiting') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await request<BrowserCheckTicket>(
          '/api/browser-checks/' + ticket.token,
        );
        if (stopped) return;
        setError('');
        setTicket((current) =>
          current?.token === result.token ? { ...current, ...result } : current,
        );
        if (result.state === 'waiting')
          timer = setTimeout(() => void poll(), 1500);
      } catch (reason) {
        if (!stopped) setError(String(reason));
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active, busy, ticket?.token, ticket?.state]);
  const checks = ticket?.report?.checks || [];
  const comparisons = ticket?.expected
    ? [
        {
          label: '语言',
          expected: ticket.expected.locale,
          actual: checks.find((row) => row.id === 'window-language')?.value,
        },
        {
          label: '时区',
          expected: ticket.expected.timezone,
          actual: checks.find((row) => row.id === 'window-timezone')?.value,
        },
      ].filter((row) => row.expected && row.actual)
    : [];
  return (
    <section aria-label="独立浏览器环境检测">
      <div className="diagnostic-target-toolbar">
        <div>
          <strong>检测登录 Claude 的独立浏览器</strong>
          <p>
            {managed
              ? '直接在这个环境的独立浏览器中打开检测页；已运行的环境会沿用当前窗口与登录状态。'
              : '生成链接后，在目标浏览器环境的新标签页打开；由那个浏览器采样并回传结果。'}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => void create()}
          disabled={
            busy ||
            loading ||
            (ticket?.state === 'waiting' && !error) ||
            (managed && !browserAvailable(data, profile))
          }
        >
          {managed ? <PanelsTopLeft size={15} /> : <Link2 size={15} />}
          {busy
            ? '正在准备…'
            : managed
              ? ticket
                ? '重新检测'
                : '打开环境并检测'
              : ticket
                ? '重新生成检测链接'
                : '生成检测链接'}
        </Button>
      </div>
      <SettingsRow
        label="目标浏览器环境"
        description={
          managed
            ? '自动应用此环境保存的代理、独立数据目录、语言、时区和指纹配置。'
            : '选择你正在使用的外部独立浏览器，复制检测链接后打开。'
        }
      >
        <Select
          label="目标浏览器环境"
          value={selected}
          disabled={busy || loading}
          onChange={(value) => {
            setTarget(value);
            setTicket(undefined);
            setError('');
          }}
          options={[
            { value: 'external', label: '其他独立浏览器' },
            ...data.profiles.map((row) => ({
              value: 'profile:' + row.id,
              label: row.name,
            })),
            ...data.apps
              .filter(
                (app) => app.id.startsWith('ccbaga') || app.id === 'chrome',
              )
              .map((app) => ({ value: 'app:' + app.id, label: app.name })),
          ]}
        />
      </SettingsRow>
      {managed && !loading && !browserAvailable(data, profile) && (
        <p className="diagnostic-note">
          请先安装此环境所选的浏览器或独立内核。
        </p>
      )}
      {(error || environmentError || ticket?.error) && (
        <p role="alert" className="diagnostic-error">
          {error || environmentError || ticket?.error}
        </p>
      )}
      {ticket?.launch?.checks && (
        <DiagnosticCard title="启动检查结果">
          <GateResults checks={ticket.launch.checks} />
        </DiagnosticCard>
      )}
      {ticket?.url && (
        <>
          <div className="browser-probe-link">
            <input
              className="settings-text-input"
              aria-label="独立浏览器检测链接"
              readOnly
              value={ticket.url}
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button
              onClick={() =>
                void copyText(ticket.url!)
                  .then(() => setCopied(true))
                  .catch((reason) => setError(String(reason)))
              }
            >
              {copied ? '已复制' : '复制链接'}
            </Button>
          </div>
          <p className="diagnostic-note">
            把这条链接粘贴到「{ticket.name}」的地址栏打开。链接 15
            分钟内有效，一次采样；结果仅回传本机。
          </p>
        </>
      )}
      {ticket?.state === 'waiting' && (
        <p role="status" className="browser-probe-wait">
          <Fingerprint size={17} />
          {managed
            ? '正在打开目标环境并等待实测结果；首次启动请留意系统钥匙串提示。启动门控通过后自动采样。'
            : '等待独立浏览器打开检测页并回传…'}
        </p>
      )}
      {ticket?.state === 'complete' && ticket.report && (
        <>
          <div className="diagnostic-summary">
            <strong>{ticket.name}</strong>
            <time>{checkedTime(ticket.report.checked_at)}</time>
            <DiagnosticBadge state="info">独立浏览器检测页回传</DiagnosticBadge>
          </div>
          {comparisons.length > 0 && (
            <div className="browser-probe-compare">
              {comparisons.map((row) => {
                const matches = row
                  .actual!.split('、')
                  .map((value) => value.toLowerCase())
                  .includes(row.expected!.toLowerCase());
                return (
                  <span key={row.label}>
                    {row.label}配置：{row.expected}{' '}
                    <DiagnosticBadge state={matches ? 'pass' : 'warn'}>
                      {matches ? '与实际一致' : '与实际不同'}
                    </DiagnosticBadge>
                  </span>
                );
              })}
            </div>
          )}
          <DiagnosticCard title="独立浏览器实际采样">
            <DiagnosticRows items={checks} />
          </DiagnosticCard>
        </>
      )}
      {!ticket && (
        <div className="diagnostic-empty">
          <Fingerprint size={25} />
          <strong>从目标独立浏览器取得真实结果</strong>
          <p>
            检测 HTTP 出口、语言、时区、浏览器标识、Canvas / WebGL、DNS 和
            WebRTC 地址。此管理窗口不参与采样。
          </p>
        </div>
      )}
    </section>
  );
}
