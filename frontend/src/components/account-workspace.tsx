import { Fingerprint, Globe2, ScanLine, UsersRound } from 'lucide-react';
import { useState } from 'react';
import type { WorkspacePage } from '../workspace';
import { Button } from './primitives';
import { WorkspaceHeader } from './workspace-header';
import { ClaudeDiagnostics } from './claude-diagnostics';

export function AccountWorkspace({
  onNavigate,
}: {
  onNavigate: (page: WorkspacePage) => void;
}) {
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  return (
    <div className="workspace-page account-workspace">
      <WorkspaceHeader
        title="账号与环境管理"
        onHome={() => onNavigate('home')}
      />
      <main className="account-workspace-content">
        <div className="account-workspace-intro">
          <span className="workspace-choice-icon">
            <UsersRound size={28} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <span className="workspace-eyebrow">账号与环境管理</span>
          <h1>账号与环境，各自独立</h1>
          <p>
            面向 Claude、Codex 等 Agent，集中管理账号及各自的浏览器与网络环境。
          </p>
        </div>
        <section
          className="account-workspace-diagnostics"
          aria-labelledby="claude-check-title"
        >
          <span className="workspace-choice-icon">
            <ScanLine size={24} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <div>
            <h2 id="claude-check-title">Claude 环境检测</h2>
            <p>查看网络出口、IP 信誉、Claude 连通性与本机环境。</p>
          </div>
          <Button variant="primary" onClick={() => setDiagnosticsOpen(true)}>
            打开检测
          </Button>
        </section>
        <section
          className="account-workspace-empty"
          aria-labelledby="account-status"
        >
          <span className="workspace-status">准备中</span>
          <h2 id="account-status">账号管理即将加入</h2>
          <p>工作区入口已就绪，账号切换与环境管理功能将在这里逐步接入。</p>
          <div className="account-workspace-features">
            {[
              {
                icon: UsersRound,
                title: '账号切换',
                text: '保存登录状态，按账号切换',
              },
              {
                icon: Fingerprint,
                title: '独立浏览器',
                text: '分别管理状态、语言、时区与指纹',
              },
              {
                icon: Globe2,
                title: '专用代理',
                text: '为每个环境配置网络并检测出口',
              },
            ].map(({ icon: FeatureIcon, title, text }) => (
              <div key={title}>
                <FeatureIcon size={20} strokeWidth={1.6} aria-hidden="true" />
                <strong>{title}</strong>
                <span>{text}</span>
              </div>
            ))}
          </div>
          <div className="account-workspace-actions">
            <Button onClick={() => onNavigate('home')}>返回开始页</Button>
            <Button variant="text" onClick={() => onNavigate('sessions')}>
              进入会话管理
            </Button>
          </div>
        </section>
      </main>
      <ClaudeDiagnostics
        open={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
      />
    </div>
  );
}
