import type { BrowserRun } from '../lib/environment-settings';
import { Disclosure } from './disclosure';

export function AppSessionSync({ run }: { run?: BrowserRun }) {
  const result = run?.session_sync;
  if (!result) return null;
  const completed = result.imported + result.updated + result.unchanged;
  return (
    <Disclosure
      className="launch-check"
      compact
      title={
        <>
          <span>
            上次启动同步
            {result.state === 'pending'
              ? ' · 尚未开始'
              : ` · ${completed} 条已同步${result.skipped ? `，${result.skipped} 条未同步` : ''}`}
          </span>
          <time dateTime={result.completed_at}>
            {new Date(result.completed_at).toLocaleString()}
          </time>
        </>
      }
    >
      <p>{result.message}</p>
      {!!result.issues.length && (
        <ul>
          {result.issues.map((issue) => (
            <li key={issue.path}>
              {issue.title}：{issue.reason}
            </li>
          ))}
        </ul>
      )}
      <p>下次启动此账号的 App 时重新检查。</p>
    </Disclosure>
  );
}
