import { useEffect } from 'react';
import { sessionStore } from '../state/session-store';
export function useLiveSync(seconds: number, animations: boolean) {
  useEffect(() => {
    document.documentElement.classList.toggle('motion-off', !animations);
  }, [animations]);
  useEffect(() => {
    const canSync = () =>
      !document.hidden &&
      !window.agentSessionsPaused &&
      window.agentSessionsWindowVisible !== false;
    const refresh = () => {
      if (canSync() && !sessionStore.view.loading)
        void sessionStore.loadTrace();
    };
    const catalogue = () => {
      if (canSync()) void sessionStore.loadSessions();
    };
    const a = setInterval(refresh, seconds * 1000),
      b = setInterval(catalogue, Math.max(15000, seconds * 1000));
    document.addEventListener('visibilitychange', refresh);
    window.loadTrace = refresh;
    window.loadSessions = catalogue;
    return () => {
      clearInterval(a);
      clearInterval(b);
      document.removeEventListener('visibilitychange', refresh);
      delete window.loadTrace;
      delete window.loadSessions;
    };
  }, [seconds]);
}
