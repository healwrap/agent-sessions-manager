import { useEffect, useState } from 'react';
import { App } from './app';
import { StartPage } from './components/start-page';
import { AccountWorkspace } from './components/account-workspace';
import { SkillWorkspace } from './components/skill-workspace';
import { useSessionStore } from './hooks/use-session-store';
import { useTheme } from './hooks/use-theme';
import { request } from './lib/api';
import type { SettingsResponse } from './lib/types';
import { sessionStore } from './state/session-store';
import { SettingsDialog } from './components/settings-dialog';
import { GuideCenter } from './components/guide-center';

export type WorkspacePage = 'sessions' | 'accounts' | 'skills';

export function Workspace() {
  const [page, setPage] = useState<WorkspacePage | 'home'>('home');
  const [sessionsOpened, setSessionsOpened] = useState(false);
  const [accountsOpened, setAccountsOpened] = useState(false);
  const [skillsOpened, setSkillsOpened] = useState(false);
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
    } else if (
      new URLSearchParams(location.search).get('workspace') === 'skills'
    ) {
      setSkillsOpened(true);
      setPage('skills');
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
  useEffect(() => {
    const openSettings = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.altKey ||
        event.shiftKey ||
        event.key !== ',' ||
        !(event.metaKey || event.ctrlKey)
      )
        return;
      const dialog = document.querySelector('dialog[open]');
      if (dialog && dialog.id !== 'settings-dialog') return;
      event.preventDefault();
      sessionStore.update({ settingsOpen: true });
    };
    window.addEventListener('keydown', openSettings);
    return () => window.removeEventListener('keydown', openSettings);
  }, []);
  function navigate(next: WorkspacePage) {
    if (next === 'sessions') setSessionsOpened(true);
    else history.replaceState(null, '', location.pathname);
    if (next === 'accounts') setAccountsOpened(true);
    if (next === 'skills') setSkillsOpened(true);
    setPage(next);
  }
  return (
    <>
      {page === 'home' && <StartPage onNavigate={navigate} />}
      {skillsOpened && (
        <div
          className="workspace-session"
          hidden={page !== 'skills'}
          inert={page !== 'skills'}
        >
          <SkillWorkspace onNavigate={navigate} active={page === 'skills'} />
        </div>
      )}
      {accountsOpened && (
        <div
          className="workspace-session"
          hidden={page !== 'accounts'}
          inert={page !== 'accounts'}
        >
          <AccountWorkspace
            onNavigate={navigate}
            active={page === 'accounts'}
          />
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
            onSkills={() => navigate('skills')}
          />
        </div>
      )}
      <SettingsDialog open={state.settingsOpen} />
      <GuideCenter onNavigate={navigate} />
      {state.toast && (
        <div id="toast" role="status">
          {state.toast}
        </div>
      )}
    </>
  );
}
