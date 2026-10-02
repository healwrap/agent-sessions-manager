import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionStore } from './state/session-store';
import { useSessionStore } from './hooks/use-session-store';
import { useTheme } from './hooks/use-theme';
import { useLiveSync } from './hooks/use-live-sync';
import { useLayoutSlide } from './hooks/use-layout-slide';
import { durationAvailable, usesRecordedDuration } from './lib/recorded-time';
import { sessionTitle } from './lib/selectors';
import { Sidebar } from './components/sidebar';
import { SettingsDialog } from './components/settings-dialog';
import { SessionActions, type SessionMenu } from './components/session-actions';
import { ChatPane } from './components/chat-pane';
import { TraceTable } from './components/trace-table';
import { Timeline } from './components/timeline';
import { DetailPanel } from './components/detail-panel';
import { Icon, IconButton } from './components/primitives';
import { StartupContent } from './components/startup-content';
export function App() {
  const state = useSessionStore(),
    [menu, setMenu] = useState<SessionMenu | null>(null),
    [search, setSearch] = useState('');
  const closeMenu = useCallback(() => setMenu(null), []);
  const main = useRef<HTMLElement>(null);
  useLayoutSlide(main, state.sidebarClosed, state.settings.animations);
  const view = state.views[state.mode];
  useEffect(() => {
    void sessionStore.initialize();
  }, []);
  useTheme(
    state.themePreview ?? state.settings.theme,
    !state.initializing,
    state.settings.theme,
  );
  useLiveSync(state.settings.syncSeconds, state.settings.animations);
  useEffect(() => {
    if (search === sessionStore.view.query) return;
    const timer = setTimeout(() => void sessionStore.searchTrace(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setSearch(state.views.trace.query);
  }, [state.views.trace.query]);
  const current = state.sessions.find((item) => item.id === state.id),
    title = current
      ? sessionTitle(current, state.preferences)
      : view.data?.title || '从项目列表打开会话';
  return (
    <>
      <div
        className={
          'application' + (state.sidebarClosed ? ' sidebar-collapsed' : '')
        }
      >
        <Sidebar
          state={state}
          managedId={menu?.item.id}
          onManage={(item, x, y) => setMenu({ item, x, y })}
        />
        <main ref={main} className="main">
          <header className="main-header" data-tauri-drag-region>
            {state.sidebarClosed && (
              <IconButton
                icon="panel"
                label="展开侧边栏"
                onClick={() => sessionStore.update({ sidebarClosed: false })}
              />
            )}
            <div className="session-title" data-tauri-drag-region>
              {title}
            </div>
            <div className="header-actions">
              <IconButton
                icon="refresh"
                label="刷新会话内容"
                disabled={view.loading}
                onClick={() => void sessionStore.loadTrace(true)}
              />
              <IconButton
                icon="more"
                label="管理当前会话"
                disabled={!current}
                onClick={(event) => {
                  if (current) {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setMenu({ item: current, x: rect.right, y: rect.bottom });
                  }
                }}
              />
              <IconButton
                icon="panel"
                label={
                  state.views.trace.detailsOpen
                    ? '关闭事件详情'
                    : '打开事件详情'
                }
                onClick={() => {
                  if (state.mode === 'chat') sessionStore.switchMode('trace');
                  sessionStore.updateView(
                    { detailsOpen: !state.views.trace.detailsOpen },
                    'trace',
                  );
                }}
              />
            </div>
          </header>
          <nav className="main-tabs" role="tablist" aria-label="会话视图">
            {[
              ['chat', '对话'],
              ['trace', '轨迹'],
            ].map(([mode, label]) => (
              <button
                key={mode}
                role="tab"
                aria-selected={state.mode === mode}
                className={state.mode === mode ? 'active' : ''}
                onClick={() =>
                  sessionStore.switchMode(mode as 'chat' | 'trace')
                }
              >
                {label}
              </button>
            ))}
          </nav>
          <div hidden={state.mode !== 'trace'} className="trajectory-toolbar">
            <div className="TrajectoryToolbar-inner">
              <div className="TrajectoryToolbar-actions">
                <button
                  className="TrajectoryToolbar-toggle"
                  aria-label="使用实际时长"
                  aria-pressed={usesRecordedDuration(
                    state.duration,
                    state.views.trace.data,
                  )}
                  disabled={!durationAvailable(state.views.trace.data)}
                  title={
                    durationAvailable(state.views.trace.data)
                      ? '按记录的执行时长展示'
                      : '会话未记录执行时长，按等宽区段展示'
                  }
                  onClick={() => {
                    sessionStore.cancelFocus();
                    sessionStore.update({ duration: !state.duration });
                    sessionStore.updateView({ range: null, viewport: null });
                  }}
                >
                  <Icon name="clock" className="TrajectoryToolbar-actionIcon" />
                  时长
                </button>
                {[
                  ['foldTurns', '轮次'],
                  ['foldCalls', '调用'],
                ].map(([key, label]) => {
                  const folded = state[key as 'foldTurns' | 'foldCalls'];
                  return (
                    <button
                      key={key}
                      className="TrajectoryToolbar-action"
                      aria-label={(folded ? '展开所有' : '收起所有') + label}
                      aria-pressed={folded}
                      onClick={() =>
                        sessionStore.update({
                          [key]: !folded,
                          ...(key === 'foldTurns'
                            ? { collapsed: new Set<number>() }
                            : { expandedCalls: new Set<string>() }),
                        })
                      }
                    >
                      <Icon
                        name={folded ? 'expand' : 'collapse'}
                        className="TrajectoryToolbar-actionIcon"
                      />
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="TrajectoryToolbar-search">
                <Icon name="search" />
                <input
                  className="TrajectoryToolbar-searchInput"
                  type="search"
                  aria-label="搜索轨迹"
                  placeholder="搜索"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
          </div>
          <div hidden={state.mode !== 'trace'}>
            <Timeline state={state} />
          </div>
          {state.mode === 'trace' && view.data && !!view.data.compactions && (
            <div className="format-warning">
              上下文已压缩 {view.data.compactions} 次，历史可见记录仍可查看
            </div>
          )}
          {state.error && (
            <div className="format-warning" role="alert">
              {state.error}
            </div>
          )}
          {state.initializing && !view.data ? (
            <StartupContent />
          ) : (
            <div className="session-content session-reveal">
              <div className="split" hidden={state.mode !== 'trace'}>
                <TraceTable state={state} />
                <DetailPanel state={state} />
              </div>
              <ChatPane state={state} />
            </div>
          )}
          <div className="session-stats">
            {view.data
              ? `${view.data.turn_count} 轮 · ${view.data.step_count != null ? `${view.data.step_count} 步` : `${view.data.event_count} 条记录`} · ${view.data.tool_count} 个工具调用 · ${view.data.provider_label}`
              : '本地会话'}
          </div>
        </main>
      </div>
      <SettingsDialog open={state.settingsOpen} />
      <SessionActions state={state} menu={menu} onClose={closeMenu} />
      {state.toast && (
        <div id="toast" role="status">
          {state.toast}
        </div>
      )}
    </>
  );
}
