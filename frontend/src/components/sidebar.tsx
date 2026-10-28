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
import { Collapse, Icon, IconButton } from './primitives';
import { StartupContent } from './startup-content';
import { MarqueeTitle } from './marquee-title';
import { Select } from './select';
import { SearchField } from './search-field';
import { SessionFilters } from './session-filters';
import { AgentIcon } from './agent-icon';
import { WorkspaceSidebar } from './workspace-layout';
import { WorkspacePicker } from './workspace-picker';
import { ChoiceGroup } from './ui';
export function Sidebar({
  state,
  onManage,
  managedId,
  onAccounts,
  onSkills,
}: {
  state: AppState;
  onManage: (item: Session, x: number, y: number) => void;
  managedId?: string;
  onAccounts?: () => void;
  onSkills?: () => void;
}) {
  const { search, setSearch, toggleSearch } = useSessionSearch(state);
  const groups = projectGroups(
    state.sessions,
    state.projects,
    state.preferences,
    state.provider,
    state.query,
    state.sources,
    state.searchMode,
  );
  return (
    <WorkspaceSidebar
      label="会话侧边栏"
      closed={state.sidebarClosed}
      width={state.preferences.sidebarWidth}
      onCollapse={() => sessionStore.update({ sidebarClosed: true })}
      onResize={(width) => {
        const { sidebarWidth: _, ...preferences } =
          sessionStore.state.preferences;
        void sessionStore.savePreferences(
          width === undefined
            ? preferences
            : { ...preferences, sidebarWidth: width },
        );
      }}
      footer={
        <>
          {(onAccounts || onSkills) && (
            <WorkspacePicker
              value="sessions"
              onChange={(page) => {
                if (page === 'accounts') onAccounts?.();
                if (page === 'skills') onSkills?.();
              }}
            />
          )}
        </>
      }
    >
      <div className="source-filter">
        <span>来源</span>
        <Select
          label="筛选 Agent"
          value={state.provider}
          onChange={(value) => void sessionStore.filter(value, search)}
          options={[
            { value: '', label: '全部 Agent', icon: <AgentIcon source="" /> },
            ...(state.sources.length
              ? state.sources
              : Object.entries(sourceNames).map(([id, label]) => ({
                  id,
                  label,
                }))
            ).map(({ id, label }) => ({
              value: id,
              label,
              icon: <AgentIcon source={id} monochrome />,
            })),
          ]}
        />
      </div>
      {state.sources
        .filter((source) => source.enabled && source.error)
        .map((source) => (
          <div className="source-warning" key={source.id}>
            {source.label}：{source.error}
          </div>
        ))}
      <div className="workspace-header">
        <span>项目</span>
        <div>
          <IconButton
            icon="search"
            label={state.searchOpen ? '取消搜索' : '搜索会话'}
            aria-expanded={state.searchOpen}
            aria-controls="session-search"
            onClick={toggleSearch}
          />
          <SessionFilters
            showSubagents={state.preferences.showSubagents !== false}
            disabled={state.sidebarClosed || state.initializing}
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
          <ChoiceGroup
            className="session-search-modes"
            label="搜索匹配方式"
            value={state.searchMode}
            onChange={(mode) =>
              void sessionStore.filter(state.provider, search, mode)
            }
            items={[
              { value: 'words', label: '拆词匹配' },
              { value: 'literal', label: '逐字匹配' },
            ]}
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
                          const rect =
                            event.currentTarget.getBoundingClientRect();
                          onManage(item, rect.right, rect.bottom);
                        }
                      }}
                    >
                      <span className="session-copy">
                        <MarqueeTitle
                          className="session-name"
                          text={sessionTitle(item, state.preferences)}
                        />
                        {(!state.provider ||
                          item.session_kind === 'subagent') && (
                          <span className="provider-tag">
                            {!state.provider && (
                              <AgentIcon
                                source={sourceId(item, state.sources)}
                              />
                            )}
                            <span className="provider-name">
                              {!state.provider &&
                                (state.sources.find(
                                  (source) =>
                                    source.id === sourceId(item, state.sources),
                                )?.label ||
                                  item.provider_label)}
                              {item.session_kind === 'subagent' &&
                                (state.provider ? '子代理' : ' · 子代理')}
                            </span>
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
                        '会话操作 ' + sessionTitle(item, state.preferences)
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
                    展开其余 {Math.max(0, group.count - visible.length)} 个会话
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
    </WorkspaceSidebar>
  );
}
