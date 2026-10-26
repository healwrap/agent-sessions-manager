import {
  ArrowRight,
  MessagesSquare,
  PanelsTopLeft,
  UsersRound,
} from 'lucide-react';
import type { WorkspacePage } from '../workspace';
import { AgentIcon } from './agent-icon';

export function StartPage({
  onNavigate,
}: {
  onNavigate: (page: WorkspacePage) => void;
}) {
  return (
    <div className="workspace-page start-page">
      <header className="workspace-header-bar" data-tauri-drag-region>
        <span className="workspace-brand" data-tauri-drag-region>
          <PanelsTopLeft size={18} aria-hidden="true" />
          Agent Sessions
        </span>
      </header>
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
            </div>
            <p>管理浏览器环境、Claude App 账号入口与专用代理，检查使用环境。</p>
            <span className="workspace-choice-note">
              浏览器 · App 账号 · 代理 · 检测
            </span>
            <span className="workspace-choice-action">
              进入账号与环境管理 <ArrowRight size={17} aria-hidden="true" />
            </span>
          </button>
        </nav>
        <p className="start-footer" id="status" role="status" />
      </main>
    </div>
  );
}
