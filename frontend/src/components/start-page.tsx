import { ArrowRight, MessagesSquare, UsersRound } from 'lucide-react';
import type { WorkspacePage } from '../workspace';
import { AgentIcon } from './agent-icon';
import { WorkspaceHeader } from './workspace-header';

export function StartPage({
  onNavigate,
}: {
  onNavigate: (page: WorkspacePage) => void;
}) {
  return (
    <div className="workspace-page start-page">
      <WorkspaceHeader />
      <main className="start-content">
        <div className="start-intro">
          <span className="workspace-eyebrow">你的 Agent 工作台</span>
          <h1>从这里开始</h1>
          <p>查看工作记录，或管理不同 Agent 的账号与环境。</p>
        </div>
        <nav className="workspace-choices" aria-label="选择功能">
          <button
            type="button"
            className="workspace-choice sessions-choice"
            onClick={() => onNavigate('sessions')}
          >
            <span className="workspace-choice-icon">
              <MessagesSquare size={28} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <h2>会话管理</h2>
            <p>按项目整理对话、搜索历史，查看 Agent 的执行轨迹与上下文。</p>
            <span className="workspace-agents" aria-label="支持多个 Agent">
              {['codex', 'claude', 'cursor', 'antigravity', 'dsh'].map(
                (source) => (
                  <AgentIcon key={source} source={source} />
                ),
              )}
              <span>所有工作记录，一处查看</span>
            </span>
            <span className="workspace-choice-action">
              进入会话管理 <ArrowRight size={17} aria-hidden="true" />
            </span>
          </button>
          <button
            type="button"
            className="workspace-choice accounts-choice"
            onClick={() => onNavigate('accounts')}
          >
            <span className="workspace-choice-icon">
              <UsersRound size={28} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <div className="workspace-choice-heading">
              <h2>账号与环境管理</h2>
              <span className="workspace-status">检测可用</span>
            </div>
            <p>面向 Claude、Codex 等 Agent，逐步接入账号切换与独立环境管理。</p>
            <span className="workspace-choice-note">账号切换功能即将接入</span>
            <span className="workspace-choice-action">
              进入账号与环境管理 <ArrowRight size={17} aria-hidden="true" />
            </span>
          </button>
        </nav>
        <p className="start-footer" id="status" role="status">
          随时返回开始页，切换你的工作方式。
        </p>
      </main>
    </div>
  );
}
