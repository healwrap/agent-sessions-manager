import { useRef, useState } from 'react';
import { useSessionFamily } from '../hooks/use-session-family';
import { sessionTitle } from '../lib/selectors';
import { markdownText } from '../lib/markdown-text';
import type { Preferences, SubagentSession } from '../lib/types';
import { Icon, IconButton } from './primitives';

const labels: Record<string, string> = {
  in_progress: '执行中',
  running: '执行中',
  completed: '已完成',
  aborted: '已停止',
  error: '失败',
  unknown: '状态未记录',
};
const active = (item: SubagentSession) =>
  ['in_progress', 'running'].includes(item.status);

export function Subagents({
  id,
  seconds,
  running,
  preferences,
  onOpen,
}: {
  id: string;
  seconds: number;
  running: boolean;
  preferences: Preferences;
  onOpen: (id: string, ref?: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { family, error, loading, loadMore, retry } = useSessionFamily(
    id,
    seconds,
    running,
    open,
  );
  const panel = useRef<HTMLDivElement>(null);
  if (!family)
    return error ? (
      <button
        className="subagents-trigger"
        onClick={retry}
        data-tooltip={error}
      >
        重试会话关联
      </button>
    ) : null;
  const isChild = family.current.session_kind === 'subagent';
  if (!isChild && !family.total) return null;
  const navigate = (key: string, ref?: string | null) => {
    panel.current?.hidePopover();
    onOpen(key, ref);
  };
  const rows = (items: SubagentSession[]) =>
    items.map((item) => (
      <div key={item.id} className="subagent-card">
        <button className="subagent-open" onClick={() => navigate(item.id)}>
          <span className="subagent-status-dot" data-status={item.status} />
          <span className="subagent-copy">
            <span className="subagent-name">
              {item.agent_name || sessionTitle(item, preferences)}
            </span>
            {item.agent_role && (
              <span className="subagent-role">{item.agent_role}</span>
            )}
            {(item.task_preview || item.agent_name) && (
              <span className="subagent-task">
                {item.task_preview
                  ? markdownText(item.task_preview)
                  : sessionTitle(item, preferences)}
              </span>
            )}
          </span>
          <span
            className="subagent-status"
            data-tooltip="状态来自本机保存的执行记录"
          >
            {labels[item.status] || '状态未记录'}
          </span>
          <Icon name="right" />
        </button>
        {item.activity_error && (
          <p className="subagent-error">{item.activity_error}</p>
        )}
        {item.result_preview && (
          <button
            className="subagent-result"
            onClick={() => navigate(item.id, item.result_ref)}
            data-tooltip="查看子代理消息"
          >
            {markdownText(item.result_preview)}
          </button>
        )}
      </div>
    ));
  return (
    <div className="subagents-navigation">
      {isChild &&
        (family.parent ? (
          <button
            className="subagents-parent"
            onClick={() => navigate(family.parent!.id)}
            data-tooltip={sessionTitle(family.parent, preferences)}
          >
            <Icon name="up" /> 返回父会话
          </button>
        ) : (
          <span
            className="subagents-orphan"
            data-tooltip="父会话未保存在当前启用的来源中"
          >
            子代理会话
          </span>
        ))}
      {!!family.total && (
        <button
          className="subagents-trigger"
          aria-expanded={open}
          aria-controls="subagents-panel"
          onClick={() => panel.current?.togglePopover()}
        >
          <Icon name="agents" /> 子代理 <span>{family.total}</span>
        </button>
      )}
      <div
        ref={panel}
        id="subagents-panel"
        popover="auto"
        className="subagents-panel"
        aria-label="子代理列表"
        onToggle={(event) => setOpen(event.newState === 'open')}
      >
        <div className="subagents-heading">
          <strong>子代理 · {family.total}</strong>
          <IconButton
            icon="close"
            label="关闭子代理列表"
            onClick={() => panel.current?.hidePopover()}
          />
        </div>
        <p className="subagents-note">
          状态与结果来自本机记录，点击查看独立会话。
        </p>
        {error && (
          <p className="subagent-error">
            {error} <button onClick={retry}>重试</button>
          </p>
        )}
        <div className="subagents-list">
          <section>
            <h3>执行中 · {family.items.filter(active).length}</h3>
            {rows(family.items.filter(active))}
            {!family.items.some(active) && (
              <p className="subagents-empty">暂无执行中的子代理</p>
            )}
          </section>
          <section>
            <h3>
              已完成 ·{' '}
              {
                family.items.filter((item) => item.status === 'completed')
                  .length
              }
            </h3>
            {rows(family.items.filter((item) => item.status === 'completed'))}
          </section>
          {family.items.some(
            (item) => !active(item) && item.status !== 'completed',
          ) && (
            <section>
              <h3>其他状态</h3>
              {rows(
                family.items.filter(
                  (item) => !active(item) && item.status !== 'completed',
                ),
              )}
            </section>
          )}
          {family.next_offset !== null && (
            <button
              className="subagents-more"
              disabled={loading}
              onClick={loadMore}
            >
              {loading ? '正在读取…' : '加载更多子代理'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
