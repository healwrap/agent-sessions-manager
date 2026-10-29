import { useSessionSearch } from '../hooks/use-session-search';
import type { AppState } from '../state/session-store';
import { sessionStore } from '../state/session-store';
import { agentGroups } from '../lib/agent-groups';
import { sourceNames, type Session } from '../lib/types';
import { Collapse, IconButton } from './primitives';
import { StartupContent } from './startup-content';
import { Select } from './select';
import { SearchField } from './search-field';
import { SessionFilters } from './session-filters';
import { AgentIcon } from './agent-icon';
import { SidebarAgentGroup } from './sidebar-agent-group';
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
  const groups = agentGroups(
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
        <span>会话</span>
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
        {groups.map((group) => (
          <SidebarAgentGroup
            key={group.id}
            state={state}
            group={group}
            onManage={onManage}
            managedId={managedId}
          />
        ))}
      </nav>
    </WorkspaceSidebar>
  );
}
