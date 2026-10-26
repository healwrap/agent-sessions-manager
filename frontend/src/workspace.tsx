import { useEffect, useState } from 'react';
import { App } from './app';
import { StartPage } from './components/start-page';
import { AccountWorkspace } from './components/account-workspace';
import { useSessionStore } from './hooks/use-session-store';
import { useTheme } from './hooks/use-theme';
import { request } from './lib/api';
import type { SettingsResponse } from './lib/types';
import { sessionStore } from './state/session-store';

export type WorkspacePage = 'sessions' | 'accounts';

export function Workspace() {
  const [page, setPage] = useState<WorkspacePage | 'home'>('home');
  const [sessionsOpened, setSessionsOpened] = useState(false);
  const [accountsOpened, setAccountsOpened] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const state = useSessionStore();
  useTheme(
    state.themePreview ?? state.settings.theme,
    preferencesReady || !state.initializing,
    state.settings.theme,
  );
  useEffect(() => {
    let current = true;
    const initial = sessionStore.state.settings;
    void request<SettingsResponse>('/api/settings')
      .then(({ value }) => {
        if (current && sessionStore.state.settings === initial)
          sessionStore.update({ settings: value });
      })
      .catch(() => {})
      .finally(() => current && setPreferencesReady(true));
    if (new URLSearchParams(location.search).has('id')) {
      setSessionsOpened(true);
      setPage('sessions');
    }
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle(
      'motion-off',
      !state.settings.animations,
    );
  }, [state.settings.animations]);
  function navigate(next: WorkspacePage) {
    if (next === 'sessions') setSessionsOpened(true);
    else history.replaceState(null, '', location.pathname);
    if (next === 'accounts') setAccountsOpened(true);
    setPage(next);
  }
  return (
    <>
      {page === 'home' && <StartPage onNavigate={navigate} />}
      {accountsOpened && (
        <div
          className="workspace-session"
          hidden={page !== 'accounts'}
          inert={page !== 'accounts'}
        >
          <AccountWorkspace onNavigate={navigate} />
        </div>
      )}
      {sessionsOpened && (
        <div
          className="workspace-session"
          hidden={page !== 'sessions'}
          inert={page !== 'sessions'}
        >
          <App
            active={page === 'sessions'}
            onAccounts={() => navigate('accounts')}
          />
        </div>
      )}
    </>
  );
}
