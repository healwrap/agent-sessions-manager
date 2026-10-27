import type { BrowserRun, GateResult } from '../lib/environment-settings';
import { DiagnosticRows } from './diagnostics-results';
import { StatusBadge } from './form-controls';
import { Disclosure } from './disclosure';
import { DnsResolvers } from './dns-resolvers';
export function GateResults({ checks }: { checks: GateResult[] }) {
  return (
    <div className="environment-gate-results">
      {checks.map((check) => (
        <div
          className="environment-gate-result"
          key={check.id}
          data-state={check.state}
        >
          <span className="environment-gate-dot" />
          <div>
            <strong>{check.title}</strong>
            {check.policy !== 'off' && (
              <>
                {check.resolvers?.length ? (
                  <DnsResolvers servers={check.resolvers} />
                ) : (
                  <p>{check.value}</p>
                )}
                {check.state !== 'pass' && check.detail && (
                  <p>{check.detail}</p>
                )}
              </>
            )}
          </div>
          <StatusBadge
            tone={
              check.policy === 'off'
                ? 'neutral'
                : check.state === 'pass'
                  ? 'success'
                  : check.policy === 'block'
                    ? 'error'
                    : 'warning'
            }
          >
            {check.policy === 'off'
              ? '已关闭'
              : `${check.policy === 'block' ? '强制' : '提醒'} · ${check.label || (check.state === 'pass' ? '通过' : check.state === 'unknown' ? '无法判定' : '失败')}`}
          </StatusBadge>
        </div>
      ))}
    </div>
  );
}
export function BrowserLaunchReport({
  run,
  title = '启动检查',
}: {
  run: BrowserRun;
  title?: string;
}) {
  return (
    <Disclosure
      className="launch-check"
      open={['checking', 'blocked', 'failed', 'interrupted'].includes(
        run.status,
      )}
      title={
        <>
          <span>{title}</span>
          <time>{new Date(run.checked_at).toLocaleString()}</time>
        </>
      }
    >
      {run.status === 'checking' && (
        <p className="environment-launch-error">{run.stage}</p>
      )}
      {run.error && (
        <p className="environment-error environment-launch-error" role="alert">
          {run.error}
        </p>
      )}
      <GateResults checks={run.checks} />
      {!!run.pages?.length && (
        <Disclosure title={`浏览器标签页（${run.pages.length}）`}>
          <ul className="environment-report-pages">
            {run.pages.map((page, index) => (
              <li key={index}>
                <strong>{page.title}</strong>
                <span>{page.url}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      {run.browser_checks.length > 0 && (
        <Disclosure title="浏览器采样结果">
          <DiagnosticRows items={run.browser_checks} showScope={false} />
        </Disclosure>
      )}
    </Disclosure>
  );
}
