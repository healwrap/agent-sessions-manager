import { useEffect } from 'react';
import { sessionStore } from '../state/session-store';
export function useLiveSync(seconds: number, animations: boolean) {
  useEffect(() => {
    document.documentElement.classList.toggle('motion-off', !animations);
  }, [animations]);
  useEffect(() => {
    let stopped = false,
      busy = false,
      catalogueBusy = false;
    let timer: ReturnType<typeof setTimeout>;
    let seen = { id: '', mode: '', revision: '' };
    let lastError = '';
    const canSync = () =>
      (!document.hidden || window.agentSessionsDesktop === true) &&
      !window.agentSessionsPaused &&
      window.agentSessionsWindowVisible !== false;
    const refresh = async () => {
      if (busy || stopped) return;
      clearTimeout(timer);
      busy = true;
      let failed = false;
      const { id, mode } = sessionStore.state;
      const current = () =>
        !stopped &&
        canSync() &&
        id === sessionStore.state.id &&
        mode === sessionStore.state.mode;
      try {
        if (
          id &&
          current() &&
          !sessionStore.state.initializing &&
          !sessionStore.view.loading
        ) {
          const value = await sessionStore.api<{ revision: string }>(
            '/api/session-version',
            { id },
          );
          if (
            current() &&
            !sessionStore.view.loading &&
            (seen.id !== id ||
              seen.mode !== mode ||
              seen.revision !== value.revision ||
              sessionStore.state.error)
          ) {
            if (
              await sessionStore.loadTrace(false, undefined, undefined, current)
            )
              seen = { id, mode, revision: value.revision };
            else failed = true;
          }
          lastError = '';
        }
      } catch (error) {
        failed = true;
        if (current() && String(error) !== lastError) {
          lastError = String(error);
          sessionStore.notify(lastError);
        }
      } finally {
        busy = false;
        const live = ['in_progress', 'running'].includes(
          sessionStore.view.data?.current_status || '',
        );
        if (!stopped)
          timer = setTimeout(
            () => void refresh(),
            !failed && live && canSync() ? 750 : seconds * 1000,
          );
      }
    };
    const catalogue = async () => {
      if (!canSync() || catalogueBusy || stopped) return;
      catalogueBusy = true;
      try {
        await sessionStore.loadSessions();
      } finally {
        catalogueBusy = false;
      }
    };
    const wake = () => void refresh();
    let scope = '';
    const unsubscribe = sessionStore.subscribe(() => {
      const state = sessionStore.state;
      const next = JSON.stringify([
        state.id,
        state.mode,
        state.initializing,
        sessionStore.view.loading,
        sessionStore.view.data?.current_status,
      ]);
      if (next !== scope) {
        scope = next;
        wake();
      }
    });
    const b = setInterval(
      () => void catalogue(),
      Math.max(15000, seconds * 1000),
    );
    timer = setTimeout(wake, 0);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.loadTrace = wake;
    window.loadSessions = () => void catalogue();
    return () => {
      stopped = true;
      unsubscribe();
      clearTimeout(timer);
      clearInterval(b);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      delete window.loadTrace;
      delete window.loadSessions;
    };
  }, [seconds]);
}
