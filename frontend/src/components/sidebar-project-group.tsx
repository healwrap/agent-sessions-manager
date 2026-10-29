import type { AppState } from '../state/session-store';
import { sessionStore } from '../state/session-store';
import { projectGroupKey, type SessionProjectGroup } from '../lib/agent-groups';
import { relativeDate, sessionTitle } from '../lib/selectors';
import type { Session } from '../lib/types';
import { Collapse, Icon, IconButton } from './primitives';
import { MarqueeTitle } from './marquee-title';
import { SessionLabels } from './session-labels';

export interface SessionManageProps {
  onManage: (item: Session, x: number, y: number) => void;
  managedId?: string;
}

export function SidebarProjectGroup({
  state,
  group,
  onManage,
  managedId,
}: SessionManageProps & { state: AppState; group: SessionProjectGroup }) {
  const key = projectGroupKey(group);
  const open =
    state.projectOpen.has(key) || (!!state.query && group.items.length > 0);
  const expanded = state.projectExpanded.has(key);
  let visible = expanded || state.query ? group.items : group.items.slice(0, 5);
  const current = group.items.find((item) => item.id === state.id);
  if (current && !visible.includes(current))
    visible = [...visible.slice(0, 4), current];
  return (
    <section className="project-group">
      <button
        className="project-heading"
        aria-expanded={open}
        title={group.project_path}
        onClick={() => sessionStore.toggleProject(group, !open)}
      >
        <Icon name="right" className="project-chevron" />
        <Icon name="folder" className="project-folder" />
        <MarqueeTitle className="project-name" text={group.project_label} />
      </button>
      <Collapse open={open}>
        {visible.map((item) => (
          <div
            key={item.id}
            className="session-item"
            data-source-visible={
              !!(
                item.account_name ||
                item.environment_name ||
                item.session_kind === 'subagent' ||
                item.execution_mode === 'non_interactive'
              )
            }
            aria-current={item.id === state.id}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              onManage(
                item,
                event.clientX || rect.right,
                event.clientY || rect.bottom,
              );
            }}
          >
            <button
              className="session-select flex min-w-0 flex-1 items-center text-left"
              onClick={() => void sessionStore.selectSession(item.id)}
              onKeyDown={(event) => {
                if (
                  event.key === 'ContextMenu' ||
                  (event.shiftKey && event.key === 'F10')
                ) {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  onManage(item, rect.right, rect.bottom);
                }
              }}
            >
              <span className="session-copy">
                <MarqueeTitle
                  className="session-name"
                  text={sessionTitle(item, state.preferences)}
                />
                <SessionLabels
                  item={item}
                  sources={state.sources}
                  provider={group.source_id || ''}
                />
              </span>
              <span className="session-date">
                {relativeDate(item.updated_at)}
              </span>
            </button>
            <IconButton
              icon="more"
              label={'会话操作 ' + sessionTitle(item, state.preferences)}
              className="icon-button session-options"
              aria-haspopup="menu"
              aria-expanded={managedId === item.id}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onManage(item, rect.right, rect.bottom);
              }}
            />
          </div>
        ))}
        {group.count > 5 && !expanded && !state.query && (
          <button
            className="more-sessions"
            onClick={() => sessionStore.expandProject(group, true)}
          >
            展开其余 {Math.max(0, group.count - visible.length)} 个会话
          </button>
        )}
        {state.query &&
          group.count > visible.length &&
          state.projectPages[key] !== null && (
            <button
              className="more-sessions"
              disabled={state.projectLoading.has(key)}
              onClick={() => void sessionStore.loadProject(group)}
            >
              更多匹配会话
            </button>
          )}
        {expanded && (
          <>
            <button
              className="more-sessions"
              onClick={() => sessionStore.expandProject(group, false)}
            >
              收起会话
            </button>
            {state.projectPages[key] !== null && (
              <button
                className="more-sessions"
                disabled={state.projectLoading.has(key)}
                onClick={() => void sessionStore.loadProject(group)}
              >
                展开更多会话
              </button>
            )}
          </>
        )}
        {open && !group.items.length && (
          <p className="sidebar-empty">
            {state.projectLoading.has(key) ? '正在读取…' : '没有会话'}
          </p>
        )}
      </Collapse>
    </section>
  );
}
