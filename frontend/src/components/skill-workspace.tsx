import { useState } from 'react';
import { BookOpen, Layers3, Plus, Puzzle, RotateCcw } from 'lucide-react';
import type { WorkspacePage } from '../workspace';
import { useSessionStore } from '../hooks/use-session-store';
import type { SkillAction } from '../lib/skill-management';
import { AgentIcon } from './agent-icon';
import {
  Button,
  BusyState,
  EmptyState,
  FactsGrid,
  IconButton,
  Notice,
  PageHeading,
  ResourceCard,
  StatusBadge,
} from './ui';
import { Markdown } from './markdown';
import { Dialog } from './primitives';
import { useSkillManagement } from '../hooks/use-skill-management';
import { SkillHistory } from './skill-history';
import { SkillInstallDialog } from './skill-install-dialog';
import { SkillInstallations } from './skill-installations';
import { WorkspaceLayout, WorkspaceSidebar } from './workspace-layout';
import { WorkspacePicker } from './workspace-picker';

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
        title="Agent Sessions"
        actions={
          closed && <WorkspacePicker value="skills" onChange={onNavigate} />
        }
        sidebar={
          <WorkspaceSidebar
            label="Skill 管理侧边栏"
            title="Skill 管理"
            closed={closed}
            width={width}
            onResize={setWidth}
            onCollapse={() => setClosed(true)}
            footer={<WorkspacePicker value="skills" onChange={onNavigate} />}
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
          </WorkspaceSidebar>
        }
      >
        <div className="environment-content skill-content ui-page">
          <div className="skill-main">
            <PageHeading
              title="Skill 管理"
              actions={
                <Button
                  disabled={busy || loading}
                  onClick={() => void reload()}
                >
                  <RotateCcw size={16} className={loading ? 'ui-spin' : ''} />
                  {loading ? '正在检测' : '重新检测'}
                </Button>
              }
            />
            {error && (
              <Notice
                tone="error"
                action={
                  <Button
                    disabled={busy || loading}
                    onClick={() => void reload()}
                  >
                    重试
                  </Button>
                }
              >
                {error}
              </Notice>
            )}
            {loading && !data ? (
              <BusyState label="正在读取 Skill 安装情况" />
            ) : (
              data && (
                <ResourceCard
                  className="skill-overview"
                  title="Agent Sessions"
                  subtitle="agent-sessions"
                  icon={<Layers3 size={24} />}
                  badge={<StatusBadge>本应用提供</StatusBadge>}
                  actions={
                    <>
                      <Button
                        onClick={() => setDocumentOpen(true)}
                        disabled={!data}
                      >
                        <BookOpen size={16} />
                        查看文档
                      </Button>
                      <Button
                        variant="primary"
                        disabled={busy || loading || !data}
                        onClick={() =>
                          setOperation({
                            action: 'install',
                            ids: targets
                              .filter(
                                (target) =>
                                  target.state === 'missing' && target.path,
                              )
                              .map((target) => target.id),
                          })
                        }
                      >
                        <Plus size={16} />
                        安装到 Agent
                      </Button>
                    </>
                  }
                >
                  <FactsGrid
                    columns={3}
                    items={[
                      {
                        label: '安装就绪',
                        value: `${ready} / ${targets.length}`,
                      },
                      {
                        label: '需要处理',
                        value: (
                          <button
                            className="ui-inline-action"
                            onClick={() =>
                              setFilter(
                                filter === 'attention' ? 'all' : 'attention',
                              )
                            }
                          >
                            {attention} 项
                          </button>
                        ),
                      },
                      { label: '应用版本', value: data?.source.version || '—' },
                    ]}
                  />
                </ResourceCard>
              )
            )}
            {notice && (
              <Notice
                tone="success"
                action={
                  <IconButton
                    icon="close"
                    label="关闭操作提示"
                    onClick={() => setNotice('')}
                  />
                }
              >
                {notice}
              </Notice>
            )}
            {!loading && data && !targets.length && (
              <EmptyState
                icon={<Puzzle size={28} />}
                title="暂无 Agent 安装目标"
              />
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
          </div>
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
