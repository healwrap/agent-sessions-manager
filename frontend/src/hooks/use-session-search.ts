import { useEffect, useState } from 'react';
import { sessionStore, type AppState } from '../state/session-store';

export function useSessionSearch(state: AppState) {
  const [search, setSearch] = useState(state.query);
  useEffect(() => {
    if (!state.searchOpen || search.trim() === sessionStore.state.query) return;
    const timer = setTimeout(
      () =>
        void sessionStore.filter(
          sessionStore.state.provider,
          search,
          state.searchMode,
        ),
      120,
    );
    return () => clearTimeout(timer);
  }, [search, state.searchOpen, state.searchMode]);
  useEffect(() => {
    const open = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.altKey ||
        event.key.toLowerCase() !== 'f' ||
        !(event.metaKey || event.ctrlKey)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      sessionStore.update({
        sidebarClosed: false,
        searchOpen: true,
        searchFocus: sessionStore.state.searchFocus + 1,
      });
    };
    window.addEventListener('keydown', open, true);
    return () => window.removeEventListener('keydown', open, true);
  }, []);
  const pending = !!state.searchIndex?.pending;
  useEffect(() => {
    if (!state.query || !pending) return;
    let loading = false;
    const timer = setInterval(() => {
      if (loading || sessionStore.state.catalogueLoading) return;
      loading = true;
      void sessionStore.loadSessions().finally(() => {
        loading = false;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state.query, state.searchMode, pending]);
  const toggleSearch = () => {
    const open = !sessionStore.state.searchOpen;
    sessionStore.update({ searchOpen: open });
    if (!open) {
      setSearch('');
      if (state.query)
        void sessionStore.filter(state.provider, '', state.searchMode);
    }
  };
  return { search, setSearch, toggleSearch };
}
