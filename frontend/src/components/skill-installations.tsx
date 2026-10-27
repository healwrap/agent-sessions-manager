import {
  Check,
  CircleAlert,
  ChevronRight,
  FolderOpen,
  Link2,
  Package,
  Trash2,
} from 'lucide-react';
import { AgentIcon } from './agent-icon';
import { StatusBadge } from './form-controls';
import { Button } from './primitives';
import { SearchField } from './search-field';
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
      <section
        className="environment-panel skill-target-panel"
        aria-label="各 Agent 安装情况"
      >
        <div className="skill-panel-heading">
          <div>
            <h2>Agent 安装情况</h2>
            <p>分别管理安装入口，独立更新与卸载。</p>
          </div>
          <span>{targets.length} 个入口</span>
        </div>
        <div className="skill-table-tools">
          <SearchField
            label="搜索 Agent"
            placeholder="搜索 Agent"
            value={query}
            onChange={onQuery}
            compact
          />
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
        </div>
        <div className="skill-target-list" role="list" aria-label="Agent 列表">
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
                  <small>{target.client}</small>
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
                <small>
                  {target.state === 'unconfigured'
                    ? '安装入口未设置'
                    : target.state === 'shared'
                      ? '共享目录提供'
                      : !target.exists
                        ? '专用入口尚不存在'
                        : target.method === 'copy'
                          ? '独立副本 · 当前用户'
                          : '链接安装 · 当前用户'}
                </small>
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
            <div className="environment-empty environment-empty-compact">
              <Package size={26} />
              <p>没有符合条件的 Agent</p>
              <Button
                onClick={() => {
                  onQuery('');
                  onFilter('all');
                }}
              >
                显示全部
              </Button>
            </div>
          )}
        </div>
        <div className="skill-table-footer">
          <span className="skill-live-dot" />
          用户级安装 · 各 Agent 分别维护
        </div>
      </section>
      <aside
        className="environment-panel skill-detail"
        aria-label={`${selected.name} 安装详情`}
      >
        <div className="skill-detail-heading">
          <AgentIcon source={selected.id} />
          <h2>{selected.name}</h2>
        </div>
        <StatusBadge tone={skillStates[selected.state].tone}>
          {skillStates[selected.state].label}
        </StatusBadge>
        <p className="skill-detail-description">
          {skillStates[selected.state].detail}
        </p>
        <dl className="skill-detail-facts">
          <div>
            <dt>安装范围</dt>
            <dd>当前用户</dd>
          </div>
          <div>
            <dt>安装方式</dt>
            <dd>
              {selected.method === 'link' ? (
                <>
                  <Link2 size={13} />
                  {selected.managed ? '跟随应用' : '本地链接'}
                </>
              ) : (
                <>
                  <Package size={13} /> 独立副本
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>提供方</dt>
            <dd>{selected.source || '尚未安装'}</dd>
          </div>
          <div>
            <dt>安装版本</dt>
            <dd>{selected.version || '未登记'}</dd>
          </div>
        </dl>
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
        <div className="skill-detail-note">
          {selected.state === 'ready' ? (
            <Check size={15} />
          ) : (
            <CircleAlert size={15} />
          )}
          <p>{selected.note}</p>
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
      </aside>
    </div>
  );
}
