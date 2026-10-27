import type { BrowserRun, GateResult } from '../lib/environment-settings';
import { runLabels } from '../lib/environment-settings';
import { DiagnosticRows } from './diagnostics-results';
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
        {(run.engine || run.pid) && (
          <p>
            {run.engine} · 进程 {run.pid || '未启动'}
          </p>
        )}
        {run.data_directory && (
          <small>独立数据目录：{run.data_directory}</small>
        )}
      </div>
      <GateResults checks={run.checks} />
      {!!run.pages?.length && (
        <details>
          <summary>当前浏览器标签页（{run.pages.length}）</summary>
          {run.pages.map((page, index) => (
            <p key={index}>
              <strong>{page.title}</strong>
              <br />
              <small>{page.url}</small>
            </p>
          ))}
        </details>
      )}
      {run.browser_checks.length > 0 && (
        <details>
          <summary>目标浏览器实际采样</summary>
          <DiagnosticRows items={run.browser_checks} />
        </details>
      )}
      <footer className="environment-panel-note">
        检查时间：{new Date(run.checked_at).toLocaleString()}
      </footer>
    </section>
  );
}
