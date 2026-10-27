import type { BrowserRun, GateResult } from '../lib/environment-settings';
import { StatusBadge } from './form-controls';
import { Disclosure } from './disclosure';
import { DnsResolvers } from './dns-resolvers';
export function GateResults({ checks }: { checks: GateResult[] }) {
  return (
    <div className="environment-gate-results">
      {checks.map((check) => {
        const tone =
          check.policy === 'off'
            ? 'neutral'
            : check.state === 'pass'
              ? 'success'
              : check.policy === 'block'
                ? 'error'
                : 'warning';
        return (
          <div
            className="environment-gate-result"
            key={check.id}
            data-state={check.state}
            data-tone={tone}
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
            <StatusBadge tone={tone}>
              {check.policy === 'off'
                ? '已关闭'
                : check.label ||
                  (check.state === 'pass'
                    ? '通过'
                    : check.state === 'unknown'
                      ? '无法判定'
                      : '失败')}
            </StatusBadge>
          </div>
        );
      })}
    </div>
  );
}
export function BrowserLaunchReport({
  run,
  title = '启动检查',
  showSummary = true,
}: {
  run: BrowserRun;
  title?: string;
  showSummary?: boolean;
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
      {showSummary && run.status === 'checking' && (
        <p className="environment-launch-error">{run.stage}</p>
      )}
      {showSummary && run.error && (
        <p className="environment-error environment-launch-error" role="alert">
          {run.error}
        </p>
      )}
      <GateResults checks={run.checks} />
    </Disclosure>
  );
}
