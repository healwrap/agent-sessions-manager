import { useSessionSearch } from '../hooks/use-session-search';
import type { AppState } from '../state/session-store';
import { sessionStore } from '../state/session-store';
import {
  projectGroups,
  relativeDate,
  sessionTitle,
  sourceId,
} from '../lib/selectors';
import { sourceNames, type Session } from '../lib/types';
import { showAbout } from '../lib/api';
import { Collapse, Icon, IconButton } from './primitives';
import { StartupContent } from './startup-content';
import { MarqueeTitle } from './marquee-title';
import { Select } from './select';
import { SearchField } from './search-field';
export function Sidebar({
  state,
  onManage,
  managedId,
}: {
  state: AppState;
  onManage: (item: Session, x: number, y: number) => void;
  managedId?: string;
}) {
  const { search, setSearch, toggleSearch } = useSessionSearch(state);
  const groups = projectGroups(
    state.sessions,
    state.projects,
    state.preferences,
    state.provider,
    state.query,
    state.archive,
    state.sources,
    state.searchMode,
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
        <div className="source-filter">
          <span>来源</span>
          <Select
            label="筛选 Agent"
            value={state.provider}
            onChange={(value) => void sessionStore.filter(value, search)}
            options={[
              { value: '', label: '全部 Agent' },
              ...(state.sources.length
                ? state.sources
                : Object.entries(sourceNames).map(([id, label]) => ({
                    id,
                    label,
                  }))
              ).map(({ id, label }) => ({ value: id, label })),
            ]}
          />
        </div>
        <div className="session-kind-filter">
          <span>显示</span>
          <label title="取消勾选后，列表和搜索结果只显示主会话">
            <input
              type="checkbox"
              aria-label="显示子代理会话"
              checked={state.preferences.showSubagents !== false}
              onChange={(event) =>
                void sessionStore.setShowSubagents(event.target.checked)
              }
            />
            子代理
          </label>
        </div>
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
              label={state.searchOpen ? '取消搜索' : '搜索会话'}
              aria-expanded={state.searchOpen}
              aria-controls="session-search"
              onClick={toggleSearch}
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
          <div id="session-search" className="session-search">
            <SearchField
              placeholder="搜索会话标题或内容"
              label="搜索会话标题或内容"
              value={search}
              onChange={setSearch}
              active={state.searchOpen}
              focusNonce={state.searchFocus}
              onDismiss={toggleSearch}
            />
            <div
              className="session-search-modes"
              role="group"
              aria-label="搜索匹配方式"
            >
              {(['words', 'literal'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={state.searchMode === mode}
                  onClick={() =>
                    void sessionStore.filter(state.provider, search, mode)
                  }
                  title={
                    mode === 'words'
                      ? '按空格拆词，所有词都需要匹配；顺序不限'
                      : '逐字匹配完整连续文本，保留中间空格'
                  }
                >
                  {mode === 'words' ? '拆词匹配' : '逐字匹配'}
                </button>
              ))}
              <span>
                {state.searchMode === 'words'
                  ? '空格分词 · 全部命中'
                  : '连续文本'}
              </span>
            </div>
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
          {state.query && !!state.searchIndex?.pending && (
            <div className="sidebar-empty" role="status">
              正在更新内容索引 {state.searchIndex.indexed}/
              {state.searchIndex.total}，结果会自动补齐
            </div>
          )}
          {state.query && !!state.searchIndex?.failed && (
            <div className="sidebar-empty" role="status">
              {state.searchIndex.failed} 个会话正文暂时无法读取
            </div>
          )}
          {state.query &&
            !state.catalogueLoading &&
            !state.searchIndex?.pending &&
            !groups.length && (
              <div className="sidebar-empty" role="status">
                没有匹配的会话
              </div>
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
                  <MarqueeTitle
                    className="project-name"
                    text={group.project_label}
                  />
                </button>
                <Collapse open={open}>
                  {visible.map((item) => (
                    <div
                      key={item.id}
                      className="session-item"
                      data-source-visible={
                        !state.provider || item.session_kind === 'subagent'
                      }
                      aria-current={item.id === state.id}
                    >
                      <button
                        className="session-select flex min-w-0 flex-1 items-center text-left"
                        onClick={() => void sessionStore.selectSession(item.id)}
                      >
                        <span className="session-copy">
                          <MarqueeTitle
                            className="session-name"
                            text={sessionTitle(item, state.preferences)}
                            prefix={
                              state.preferences.pinned.includes(item.id) && (
                                <Icon name="pin" className="session-pin" />
                              )
                            }
                          />
                          {(!state.provider ||
                            item.session_kind === 'subagent') && (
                            <span className="provider-tag">
                              {!state.provider &&
                                (state.sources.find(
                                  (source) =>
                                    source.id === sourceId(item, state.sources),
                                )?.label ||
                                  item.provider_label)}
                              {item.session_kind === 'subagent' &&
                                (state.provider ? '子代理' : ' · 子代理')}
                            </span>
                          )}
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
              void showAbout().catch((error) =>
                sessionStore.notify(String(error)),
              )
            }
          />
        </footer>
      </aside>
    </div>
  );
}
