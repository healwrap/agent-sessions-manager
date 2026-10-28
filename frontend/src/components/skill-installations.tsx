import {
  Check,
  CircleAlert,
  ChevronRight,
  FolderOpen,
  Package,
  Trash2,
} from 'lucide-react';
import { AgentIcon } from './agent-icon';
import { StatusBadge } from './form-controls';
import { Button } from './primitives';
import {
  CollectionToolbar,
  EmptyState,
  FactsGrid,
  Panel,
  SectionHeading,
} from './ui';
import { Select } from './select';
import {
  installedTarget,
  skillActions,
  skillStates,
  suggestedAction,
  type SkillAction,
  type SkillTarget,
} from '../lib/skill-management';

export function SkillInstallations({
  targets,
  selected,
  busy,
  filter,
  query,
  onFilter,
  onQuery,
  onSelect,
  onAction,
}: {
  targets: SkillTarget[];
  selected: SkillTarget;
  busy: boolean;
  filter: string;
  query: string;
  onFilter: (value: string) => void;
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
  onAction: (action: SkillAction, ids: string[]) => void;
}) {
  const visible = targets.filter(
    (target) =>
      (filter === 'all' ||
        (filter === 'attention'
          ? ['outdated', 'broken', 'modified', 'error'].includes(target.state)
          : target.state === filter)) &&
      `${target.name} ${target.client}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="skill-install-layout">
      <Panel
        padding="none"
        className="skill-target-panel"
        aria-label="各 Agent 安装情况"
      >
        <SectionHeading
          title="Agent 安装情况"
          actions={<span className="ui-count">{targets.length} 个入口</span>}
        />
        <CollectionToolbar
          query={query}
          onQuery={onQuery}
          searchLabel="搜索 Agent"
        >
          <Select
            label="筛选安装状态"
            value={filter}
            onChange={onFilter}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'ready', label: '已安装' },
              { value: 'shared', label: '共享可用' },
              { value: 'attention', label: '需要处理' },
              { value: 'missing', label: '未安装' },
              { value: 'unconfigured', label: '待配置' },
            ]}
          />
        </CollectionToolbar>
        <div
          className="skill-target-list"
          role="list"
          aria-label="Agent 列表"
          tabIndex={0}
        >
          <div className="skill-target-columns" aria-hidden="true">
            <span>Agent</span>
            <span>安装状态</span>
            <span>操作</span>
          </div>
          {visible.map((target) => (
            <div
              role="listitem"
              className="skill-target-row"
              key={target.id}
              data-selected={selected.id === target.id}
            >
              <button
                className="skill-agent-select"
                onClick={() => onSelect(target.id)}
                aria-label={`查看 ${target.name} 安装详情`}
                aria-pressed={selected.id === target.id}
              >
                <span className="skill-agent-mark">
                  <AgentIcon source={target.id} />
                </span>
                <span>
                  <strong>{target.name}</strong>
                </span>
              </button>
              <button
                className="skill-state-select"
                onClick={() => onSelect(target.id)}
                aria-label={`${target.name}：${skillStates[target.state].label}`}
              >
                <StatusBadge tone={skillStates[target.state].tone}>
                  {target.state === 'ready' && <Check size={12} />}
                  {skillStates[target.state].label}
                </StatusBadge>
              </button>
              <div className="skill-target-actions">
                <Button
                  size="small"
                  disabled={busy}
                  variant={target.state === 'ready' ? 'text' : 'secondary'}
                  onClick={() =>
                    target.state === 'ready'
                      ? onSelect(target.id)
                      : onAction(suggestedAction(target), [target.id])
                  }
                >
                  {target.state === 'ready'
                    ? '管理'
                    : target.state === 'shared'
                      ? '独立安装'
                      : skillActions[suggestedAction(target)]}
                  {target.state === 'ready' && <ChevronRight size={13} />}
                </Button>
              </div>
            </div>
          ))}
          {!visible.length && (
            <EmptyState
              compact
              icon={<Package size={26} />}
              title="没有符合条件的 Agent"
              action={
                <Button
                  onClick={() => {
                    onQuery('');
                    onFilter('all');
                  }}
                >
                  清除筛选
                </Button>
              }
            />
          )}
        </div>
      </Panel>
      <Panel
        role="complementary"
        className="skill-detail"
        aria-label={`${selected.name} 安装详情`}
      >
        <div className="skill-detail-heading">
          <AgentIcon source={selected.id} />
          <h2>{selected.name}</h2>
        </div>
        <div
          className="skill-detail-body"
          key={selected.id}
          role="region"
          aria-label={`${selected.name} 安装信息`}
          tabIndex={0}
        >
          <StatusBadge tone={skillStates[selected.state].tone}>
            {skillStates[selected.state].label}
          </StatusBadge>
          <p className="skill-detail-description">
            {skillStates[selected.state].detail}
          </p>
          <FactsGrid
            columns={1}
            items={[
              { label: '安装范围', value: '当前用户' },
              {
                label: '安装方式',
                value:
                  selected.method === 'link'
                    ? selected.managed
                      ? '跟随应用'
                      : '本地链接'
                    : '独立副本',
              },
              { label: '提供方', value: selected.source || '尚未安装' },
              { label: '安装版本', value: selected.version || '未登记' },
            ]}
          />
          <div className="skill-path-block">
            <span>
              <FolderOpen size={14} />
              安装入口
            </span>
            <code>{selected.path || '尚未设置'}</code>
            {selected.effective_path && (
              <>
                <span>当前共享入口</span>
                <code>{selected.effective_path}</code>
              </>
            )}
            {selected.resolved_path && selected.exists && (
              <>
                <span>实际目标</span>
                <code>{selected.resolved_path}</code>
              </>
            )}
            <Button
              variant="text"
              size="small"
              disabled={busy}
              onClick={() => onAction('configure', [selected.id])}
            >
              配置路径 <ChevronRight size={12} />
            </Button>
          </div>
          {['outdated', 'broken', 'modified', 'error', 'unconfigured'].includes(
            selected.state,
          ) && (
            <div className="skill-detail-note">
              {selected.state === 'ready' ? (
                <Check size={15} />
              ) : (
                <CircleAlert size={15} />
              )}
              <p>{selected.note}</p>
            </div>
          )}
        </div>
        <div className="skill-detail-actions">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              onAction(
                selected.state === 'ready'
                  ? 'install'
                  : suggestedAction(selected),
                [selected.id],
              )
            }
          >
            {selected.state === 'ready'
              ? '重新安装'
              : skillActions[suggestedAction(selected)]}
          </Button>
          {installedTarget(selected) && (
            <Button
              variant="text"
              disabled={busy}
              onClick={() => onAction('remove', [selected.id])}
            >
              <Trash2 size={14} />
              卸载
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}
