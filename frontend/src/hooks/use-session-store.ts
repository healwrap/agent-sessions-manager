import { useSyncExternalStore } from 'react';
import { sessionStore } from '../state/session-store';
export const useSessionStore = () =>
  useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
