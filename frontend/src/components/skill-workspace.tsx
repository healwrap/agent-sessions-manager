import { useState } from 'react';
import {
  BookOpen,
  Check,
  Layers3,
  Link2,
  Package,
  Plus,
  Puzzle,
  RotateCcw,
} from 'lucide-react';
import type { WorkspacePage } from '../workspace';
import { useSessionStore } from '../hooks/use-session-store';
import type { SkillAction } from '../lib/skill-management';
import { AgentIcon } from './agent-icon';
import { StatusBadge } from './form-controls';
import { Markdown } from './markdown';
import { Button, Dialog, IconButton } from './primitives';
import { useSkillManagement } from '../hooks/use-skill-management';
import { SkillHistory } from './skill-history';
import { SkillInstallDialog } from './skill-install-dialog';
import { SkillInstallations } from './skill-installations';
import {
  WorkspaceLayout,
  WorkspaceSidebar,
  WorkspaceSwitch,
} from './workspace-layout';

export function SkillWorkspace({
  onNavigate,
  active = true,
}: {
  onNavigate: (page: WorkspacePage) => void;
  active?: boolean;
}) {
  const { settings } = useSessionStore();
  const { data, loading, busy, error, notice, reload, setNotice, mutate } =
    useSkillManagement(active);
  const targets = data?.targets || [];
  const [closed, setClosed] = useState(false);
  const [width, setWidth] = useState<number>();
  const [selected, setSelected] = useState('codex');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [documentOpen, setDocumentOpen] = useState(false);
  const [operation, setOperation] = useState<{
    action: SkillAction;
    ids: string[];
  }>();
  const current =
    targets.find((target) => target.id === selected) || targets[0];
  const ready = targets.filter((target) =>
    ['ready', 'shared', 'external'].includes(target.state),
  ).length;
  const attention = targets.filter((target) =>
    ['outdated', 'broken', 'modified', 'error'].includes(target.state),
  ).length;
  async function complete(token: string) {
    await mutate('/api/skills/apply', { token });
    setOperation(undefined);
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
            <StatusBadge>本机管理</StatusBadge>
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
          <div className="skill-source-line">
            <span>
              来源：{data?.source.source || '正在读取'} · 版本{' '}
              {data?.source.version || '—'}
            </span>
            <span>
              {data &&
                `检测于 ${new Date(data.checked_at).toLocaleTimeString()}`}
            </span>
          </div>
          {error && (
            <div className="environment-error-bar" role="alert">
              <span>{error}</span>
              <Button disabled={busy || loading} onClick={() => void reload()}>
                重新读取
              </Button>
            </div>
          )}
          <header className="environment-page-heading skill-page-heading">
            <div>
              <div className="skill-eyebrow">SKILL LIBRARY</div>
              <h1>Skill 安装管理</h1>
              <p>
                统一查看 Agent Sessions skill 在各个 Agent 中的安装与更新情况。
              </p>
            </div>
            <Button disabled={busy || loading} onClick={() => void reload()}>
              <RotateCcw size={14} />
              {loading ? '正在检测…' : '重新检测'}
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
                disabled={busy || loading || !data}
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
                disabled={!data}
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
          {current && (
            <SkillInstallations
              busy={busy}
              targets={targets}
              selected={current}
              query={query}
              filter={filter}
              onFilter={setFilter}
              onQuery={setQuery}
              onSelect={setSelected}
              onAction={(action, ids) => setOperation({ action, ids })}
            />
          )}
          <SkillHistory
            records={data?.records || []}
            busy={busy}
            onRestore={(id) =>
              void mutate('/api/skills/restore', { id }).catch(() => {})
            }
          />
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
          <Markdown
            text={(data?.source.document || '').replace(
              /^---[\s\S]*?---\s*/,
              '',
            )}
          />
        </div>
      </Dialog>
    </>
  );
}
