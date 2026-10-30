import type { BrowserRun } from '../lib/environment-settings';
import { Disclosure } from './disclosure';

export function AppSessionSync({ run }: { run?: BrowserRun }) {
  const result = run?.session_sync;
  if (!result) return null;
  const completed = result.imported + result.updated + result.unchanged;
  return (
    <Disclosure
      className="launch-check app-session-sync"
      compact
      title={
        <>
          <span>
            会话同步
            {result.state === 'pending'
              ? ' · 尚未开始'
              : ` · ${completed} 条已同步${result.skipped ? `，${result.skipped} 条未同步` : ''}`}
          </span>
          <time dateTime={result.completed_at} title="上次启动时的同步时间">
            {new Date(result.completed_at).toLocaleString()}
          </time>
        </>
      }
    >
      <p>
        每次启动此账号的 Claude App 时，自动同步各账号与本机 Claude Code
        的全部可恢复会话。
      </p>
      <p>上次同步结果：{result.message}</p>
      {!!result.issues.length && (
        <ul>
          {result.issues.map((issue) => (
            <li key={issue.path}>
              {issue.title}：{issue.reason}
            </li>
          ))}
        </ul>
      )}
    </Disclosure>
  );
}
