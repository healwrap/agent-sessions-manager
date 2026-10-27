import { useState } from 'react';
import {
  BookOpen,
  Check,
  Clock3,
  Layers3,
  Link2,
  Package,
  Plus,
  Puzzle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import skillDocument from '../../../SKILL.md?raw';
import type { WorkspacePage } from '../workspace';
import { useSessionStore } from '../hooks/use-session-store';
import {
  skillActions,
  skillTargets,
  type SkillAction,
  type SkillTarget,
} from '../lib/skill-preview';
import { AgentIcon } from './agent-icon';
import { StatusBadge } from './form-controls';
import { Markdown } from './markdown';
import { Button, Dialog, IconButton } from './primitives';
import { SkillInstallDialog } from './skill-install-dialog';
import { SkillInstallations } from './skill-installations';
import {
  WorkspaceLayout,
  WorkspaceSidebar,
  WorkspaceSwitch,
} from './workspace-layout';

export function SkillWorkspace({
  onNavigate,
}: {
  onNavigate: (page: WorkspacePage) => void;
}) {
  const { settings } = useSessionStore();
  const [closed, setClosed] = useState(false);
  const [width, setWidth] = useState<number>();
  const [targets, setTargets] = useState<SkillTarget[]>(skillTargets);
  const [selected, setSelected] = useState('codex');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [documentOpen, setDocumentOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [operation, setOperation] = useState<{
    action: SkillAction;
    ids: string[];
  }>();
  const [records, setRecords] = useState<string[]>([]);
  const current = targets.find((target) => target.id === selected)!;
  const ready = targets.filter((target) => target.state === 'ready').length;
  const attention = targets.filter((target) =>
    ['outdated', 'broken'].includes(target.state),
  ).length;
  function complete(
    action: SkillAction,
    ids: string[],
    method: 'link' | 'copy',
    path: string,
  ) {
    setTargets((value) =>
      value.map((target) =>
        !ids.includes(target.id)
          ? target
          : {
              ...target,
              state:
                action === 'remove'
                  ? 'missing'
                  : action === 'configure'
                    ? target.state === 'unconfigured'
                      ? 'missing'
                      : target.state
                    : 'ready',
              method:
                action === 'remove' || action === 'configure'
                  ? target.method
                  : method,
              path: action === 'configure' ? path.trim() : target.path,
              note:
                action === 'remove'
                  ? '已移除这个 Agent 的安装入口，源文件保留'
                  : action === 'configure'
                    ? '安装入口已配置，可以继续安装'
                    : '文件已就绪，Agent 加载情况待新会话验证',
            },
      ),
    );
    const names = targets
      .filter((target) => ids.includes(target.id))
      .map((target) => target.name)
      .join('、');
    const message = `预览已${action === 'configure' ? '配置' : skillActions[action]}：${names}`;
    setNotice(message);
    setRecords((value) => [message, ...value].slice(0, 6));
    setSelected(ids[0]);
    setOperation(undefined);
  }
  function reset() {
    setTargets(skillTargets);
    setFilter('all');
    setQuery('');
    setSelected('codex');
    setRecords([]);
    setNotice('已恢复初始示例状态');
  }
  return (
    <>
      <WorkspaceLayout
        className="skill-workspace"
        closed={closed}
        onExpand={() => setClosed(false)}
        animations={settings.animations}
        title={
          <>
            Skill 管理 <span className="workspace-title-separator">/</span>{' '}
            Agent Sessions
          </>
        }
        actions={
          <>
            {closed && (
              <>
                <WorkspaceSwitch onClick={() => onNavigate('sessions')}>
                  会话管理
                </WorkspaceSwitch>
                <WorkspaceSwitch onClick={() => onNavigate('accounts')}>
                  账号与环境管理
                </WorkspaceSwitch>
              </>
            )}
            <StatusBadge>交互预览</StatusBadge>
          </>
        }
        sidebar={
          <WorkspaceSidebar
            label="Skill 管理侧边栏"
            title="Skill 管理"
            closed={closed}
            width={width}
            onResize={setWidth}
            onCollapse={() => setClosed(true)}
            footer={
              <>
                <WorkspaceSwitch onClick={() => onNavigate('sessions')}>
                  进入会话管理
                </WorkspaceSwitch>
                <WorkspaceSwitch onClick={() => onNavigate('accounts')}>
                  账号与环境管理
                </WorkspaceSwitch>
              </>
            }
          >
            <nav className="environment-navigation" aria-label="Skill 导航">
              <button
                className="panel-row"
                aria-current="page"
                onClick={() => {
                  setFilter('all');
                  setQuery('');
                }}
              >
                <Puzzle size={17} />
                <span>本应用提供</span>
                <small>1</small>
              </button>
            </nav>
            <div className="skill-sidebar-label">安装目标</div>
            <nav className="environment-navigation" aria-label="Agent 安装目标">
              {targets.map((target) => (
                <button
                  className="panel-row"
                  key={target.id}
                  onClick={() => setSelected(target.id)}
                  aria-current={selected === target.id ? 'true' : undefined}
                >
                  <AgentIcon source={target.id} />
                  <span>{target.name}</span>
                  <i className="skill-sidebar-dot" data-state={target.state} />
                </button>
              ))}
            </nav>
            <div className="skill-sidebar-tip">
              <Link2 size={15} />
              <p>一个 Skill，分别接入不同 Agent。</p>
            </div>
          </WorkspaceSidebar>
        }
      >
        <div className="environment-content skill-content">
          <div className="skill-preview-banner">
            <span>
              <Sparkles size={14} />
              设计预览 · 安装状态为示例，操作不影响真实环境
            </span>
            <button onClick={reset}>
              重置预览 <RotateCcw size={12} />
            </button>
          </div>
          <header className="environment-page-heading skill-page-heading">
            <div>
              <div className="skill-eyebrow">SKILL LIBRARY</div>
              <h1>Skill 安装管理</h1>
              <p>
                统一查看 Agent Sessions skill 在各个 Agent 中的安装与更新情况。
              </p>
            </div>
            <Button
              onClick={() => {
                setNotice('预览检测完成：已检查示例安装入口与版本状态');
              }}
            >
              <RotateCcw size={14} />
              重新检测
            </Button>
          </header>
          <section
            className="environment-panel skill-overview"
            aria-label="Agent Sessions skill"
          >
            <div className="skill-overview-main">
              <div className="skill-cover">
                <Layers3 size={31} strokeWidth={1.6} />
              </div>
              <div className="skill-overview-copy">
                <div className="skill-overview-title">
                  <h2>Agent Sessions</h2>
                  <StatusBadge>本应用提供</StatusBadge>
                </div>
                <code>agent-sessions</code>
                <p>
                  跨 Agent 检索历史会话、读取执行证据，通过引用恢复长期上下文。
                </p>
                <div className="skill-capabilities">
                  <span>
                    <Check size={12} />
                    会话检索
                  </span>
                  <span>
                    <Check size={12} />
                    轨迹读取
                  </span>
                  <span>
                    <Check size={12} />
                    上下文恢复
                  </span>
                </div>
              </div>
            </div>
            <div className="skill-overview-side">
              <div className="skill-coverage">
                <strong>
                  {ready}
                  <small> / {targets.length}</small>
                </strong>
                <span>安装文件就绪</span>
              </div>
              <div className="skill-coverage-bar" aria-hidden="true">
                {targets.map((target) => (
                  <i key={target.id} data-state={target.state} />
                ))}
              </div>
              <Button
                variant="primary"
                onClick={() =>
                  setOperation({
                    action: 'install',
                    ids: targets
                      .filter(
                        (target) => target.state === 'missing' && target.path,
                      )
                      .map((target) => target.id),
                  })
                }
              >
                <Plus size={15} />
                安装到 Agent
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={() => setDocumentOpen(true)}
              >
                <BookOpen size={13} />
                查看 Skill 文档
              </Button>
            </div>
          </section>
          <div className="skill-section-line">
            <span>
              <Package size={14} />
              当前用户的安装
            </span>
            <button
              onClick={() =>
                setFilter(filter === 'attention' ? 'all' : 'attention')
              }
              aria-pressed={filter === 'attention'}
            >
              {attention} 项需要处理 <span>→</span>
            </button>
          </div>
          {notice && (
            <div className="skill-notice" role="status">
              <Check size={14} />
              <span>{notice}</span>
              <IconButton
                icon="close"
                label="关闭操作提示"
                onClick={() => setNotice('')}
              />
            </div>
          )}
          <SkillInstallations
            targets={targets}
            selected={current}
            query={query}
            filter={filter}
            onFilter={setFilter}
            onQuery={setQuery}
            onSelect={setSelected}
            onAction={(action, ids) => setOperation({ action, ids })}
          />
          {records.length > 0 && (
            <details className="skill-history">
              <summary>
                <Clock3 size={14} />
                本次预览的操作记录 <span>{records.length}</span>
              </summary>
              {records.map((record, index) => (
                <p key={index}>{record}</p>
              ))}
            </details>
          )}
        </div>
      </WorkspaceLayout>
      {operation && (
        <SkillInstallDialog
          key={`${operation.action}-${operation.ids.join('-')}`}
          action={operation.action}
          initialIds={operation.ids}
          targets={targets}
          onClose={() => setOperation(undefined)}
          onComplete={complete}
        />
      )}
      <Dialog
        open={documentOpen}
        onClose={() => setDocumentOpen(false)}
        title="Agent Sessions Skill 文档"
        className="editor-dialog skill-document-dialog"
      >
        <header className="editor-dialog-heading">
          <h2>Agent Sessions Skill</h2>
          <IconButton
            icon="close"
            label="关闭 Skill 文档"
            onClick={() => setDocumentOpen(false)}
          />
        </header>
        <div className="skill-document-body">
          <Markdown text={skillDocument.replace(/^---[\s\S]*?---\s*/, '')} />
        </div>
      </Dialog>
    </>
  );
}
