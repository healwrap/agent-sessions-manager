import { useEffect, useState } from 'react';
import type { AppState } from '../state/session-store';
import { sessionStore } from '../state/session-store';
import {
  projectGroups,
  relativeDate,
  sessionTitle,
  sourceId,
} from '../lib/selectors';
import { sourceNames, type Session } from '../lib/types';
import { Collapse, Icon, IconButton } from './primitives';
import { StartupContent } from './startup-content';
export function Sidebar({
  state,
  onManage,
  managedId,
}: {
  state: AppState;
  onManage: (item: Session, x: number, y: number) => void;
  managedId?: string;
}) {
  const [search, setSearch] = useState(state.query);
  useEffect(() => {
    if (search === sessionStore.state.query) return;
    const timer = setTimeout(
      () => void sessionStore.filter(sessionStore.state.provider, search),
      250,
    );
    return () => clearTimeout(timer);
  }, [search]);
  const groups = projectGroups(
    state.sessions,
    state.projects,
    state.preferences,
    state.provider,
    state.query,
    state.archive,
  );
  return (
    <div className="sidebar-slot" data-closed={state.sidebarClosed}>
      <aside
        className="sidebar"
        aria-label="会话侧边栏"
        inert={state.sidebarClosed}
      >
        <div className="titlebar" data-tauri-drag-region>
          <span className="traffic-lights">
            <i />
            <i />
            <i />
          </span>
          <IconButton
            icon="panel"
            label="收起侧边栏"
            onClick={() => sessionStore.update({ sidebarClosed: true })}
          />
        </div>
        <div className="brand-row">
          <span className="brand-name">Agent Sessions</span>
        </div>
        <label className="source-filter">
          来源
          <select
            aria-label="筛选 Agent"
            value={state.provider}
            onChange={(event) =>
              void sessionStore.filter(event.target.value, search)
            }
          >
            <option value="">全部 Agent</option>
            {Object.entries(sourceNames).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {state.sources
          .filter((source) => source.enabled && source.error)
          .map((source) => (
            <div className="source-warning" key={source.id}>
              {source.label}：{source.error}
            </div>
          ))}
        <div className="workspace-header">
          <span>{state.archive ? '归档会话' : '项目'}</span>
          <div>
            <IconButton
              icon="search"
              label="搜索会话"
              onClick={() =>
                sessionStore.update({ searchOpen: !state.searchOpen })
              }
            />
            <IconButton
              icon="archive"
              label={state.archive ? '返回会话' : '查看归档会话'}
              aria-pressed={state.archive}
              onClick={() => sessionStore.update({ archive: !state.archive })}
            />
            <IconButton
              icon="refresh"
              label="刷新会话"
              onClick={() => void sessionStore.loadSessions()}
            />
          </div>
        </div>
        <Collapse open={state.searchOpen}>
          <div className="session-search">
            <input
              type="search"
              placeholder="搜索会话标题或内容"
              aria-label="搜索会话标题或内容"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </Collapse>
        <nav
          className="session-list"
          aria-label="Agent 会话"
          data-busy={state.catalogueLoading}
        >
          {state.initializing && !state.projects.length && (
            <StartupContent sidebar />
          )}
          {state.query && state.catalogueLoading && (
            <div role="status">正在搜索标题和内容…</div>
          )}
          {groups.map((group) => {
            const key = group.project_id,
              open =
                state.projectOpen.has(key) ||
                (!!state.query && group.items.length > 0),
              expanded = state.projectExpanded.has(key);
            let visible =
              expanded || state.query ? group.items : group.items.slice(0, 5);
            const current = group.items.find((item) => item.id === state.id);
            if (current && !visible.includes(current))
              visible = [...visible.slice(0, 4), current];
            return (
              <section key={key} className="project-group">
                <button
                  className="project-heading"
                  aria-expanded={open}
                  title={group.project_path}
                  onClick={() => sessionStore.toggleProject(key, !open)}
                >
                  <Icon name="right" className="project-chevron" />
                  <Icon name="folder" className="project-folder" />
                  <span className="project-name">{group.project_label}</span>
                </button>
                <Collapse open={open}>
                  {visible.map((item) => (
                    <div
                      key={item.id}
                      className="session-item"
                      aria-current={item.id === state.id}
                    >
                      <button
                        className="session-select flex min-w-0 flex-1 items-center text-left"
                        onClick={() => void sessionStore.selectSession(item.id)}
                      >
                        <span className="session-name">
                          {state.preferences.pinned.includes(item.id) && (
                            <Icon name="pin" className="session-pin" />
                          )}
                          {sessionTitle(item, state.preferences)}
                        </span>
                        <span className="provider-tag">
                          {sourceNames[sourceId(item)] || item.provider_label}
                        </span>
                        <span className="session-date">
                          {relativeDate(item.updated_at)}
                        </span>
                      </button>
                      <IconButton
                        icon="more"
                        label={
                          '管理会话 ' + sessionTitle(item, state.preferences)
                        }
                        className="icon-button session-options"
                        aria-haspopup="menu"
                        aria-expanded={managedId === item.id}
                        onClick={(event) => {
                          const rect =
                            event.currentTarget.getBoundingClientRect();
                          onManage(item, rect.right, rect.bottom);
                        }}
                      />
                    </div>
                  ))}
                  {group.count > 5 && !expanded && !state.query && (
                    <button
                      className="more-sessions"
                      onClick={() => sessionStore.expandProject(key, true)}
                    >
                      展开其余 {Math.max(0, group.count - visible.length)}{' '}
                      个会话
                    </button>
                  )}
                  {state.query &&
                    group.count > visible.length &&
                    state.projectPages[key] !== null && (
                      <button
                        className="more-sessions"
                        disabled={state.projectLoading.has(key)}
                        onClick={() => void sessionStore.loadProject(key)}
                      >
                        更多匹配会话
                      </button>
                    )}
                  {expanded && (
                    <>
                      <button
                        className="more-sessions"
                        onClick={() => sessionStore.expandProject(key, false)}
                      >
                        收起会话
                      </button>
                      {state.projectPages[key] !== null && (
                        <button
                          className="more-sessions"
                          disabled={state.projectLoading.has(key)}
                          onClick={() => void sessionStore.loadProject(key)}
                        >
                          展开更多会话
                        </button>
                      )}
                    </>
                  )}
                  {open && !group.items.length && (
                    <p className="px-7 text-xs text-muted">
                      {state.projectLoading.has(key) ? '正在读取…' : '没有会话'}
                    </p>
                  )}
                </Collapse>
              </section>
            );
          })}
        </nav>
        <footer>
          <button
            className="panel-row"
            aria-haspopup="dialog"
            aria-expanded={state.settingsOpen}
            onClick={() => sessionStore.update({ settingsOpen: true })}
          >
            <Icon name="settings" />
            设置
          </button>
          <IconButton
            icon="info"
            label="关于 Agent Sessions"
            onClick={() =>
              sessionStore.update({
                info: {
                  title: 'Agent Sessions',
                  text: '管理本地 Agent 会话、对话与轨迹。\n支持 Codex、Claude Code、Antigravity 和 Antigravity CLI。\n历史文件只读；名称、归档与设置单独保存。',
                },
              })
            }
          />
        </footer>
      </aside>
    </div>
  );
}
