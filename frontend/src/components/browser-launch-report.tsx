import type { BrowserRun, GateResult } from '../lib/environment-settings';
import { runLabels } from '../lib/environment-settings';
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
                <p>{check.value}</p>
                {check.detail && <small>{check.detail}</small>}
              </>
            )}
          </div>
          <span className="environment-tag">
            {check.policy === 'off'
              ? '已关闭'
              : `${check.policy === 'block' ? '强制' : '提醒'} · ${check.state === 'pass' ? '通过' : check.state === 'unknown' ? '未验证' : '失败'}`}
          </span>
        </div>
      ))}
    </div>
  );
}
export function BrowserLaunchReport({ run }: { run: BrowserRun }) {
  return (
    <section className="environment-panel environment-launch-report">
      <header className="environment-panel-heading">
        <h2>{run.name} · 启动检查</h2>
        <span className="environment-tag">{runLabels[run.status]}</span>
      </header>
      <div className="environment-launch-summary">
        <strong>{run.stage}</strong>
        <p>
          {[
            run.resolved.ip,
            run.resolved.country,
            run.resolved.locale,
            run.resolved.timezone,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {run.error && (
          <p className="environment-error" role="alert">
            {run.error}
          </p>
        )}
      </div>
      <GateResults checks={run.checks} />
      <footer className="environment-panel-note">
        检查时间：{new Date(run.checked_at).toLocaleString()}
      </footer>
    </section>
  );
}
