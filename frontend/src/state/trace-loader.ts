import type { SessionStore } from './session-store';
import type { Trajectory } from '../lib/types';
import { projectGroupKey } from '../lib/agent-groups';
export function createTraceLoader(store: SessionStore) {
  const generations = { trace: 0, chat: 0 };
  const refreshing = new Set<'trace' | 'chat'>();
  async function loadTrace(
    force = false,
    edge?: 'before' | 'after',
    offset?: number,
    current: () => boolean = () => true,
  ) {
    const { id, mode } = store.state;
    if (!id) return false;
    // Polling and pagination must not supersede a foreground navigation.
    if (!force && store.state.views[mode].loading) return false;
    const background = !force && !edge && !!store.state.views[mode].data;
    if (background && refreshing.has(mode)) return false;
    if (background) refreshing.add(mode);
    const generation = ++generations[mode],
      view = store.state.views[mode],
      query = view.query;
    const valid = () =>
      generation === generations[mode] && id === store.state.id && current();
    if (!background)
      store.updateView({ loading: true, loadingEdge: edge || null }, mode);
    try {
      let start =
        offset ??
        (edge === 'before'
          ? Math.max(0, view.offset - 150)
          : edge === 'after'
            ? (view.next ?? 0)
            : view.offset);
      const get = (at: number, limit = 150) =>
        store.api<Trajectory>('/api/trajectory', {
          id,
          q: query,
          kind: 'all',
          offset: at,
          limit,
        });
      let first = await get(
        start,
        edge === 'before' ? view.offset - start : 150,
      );
      if (!valid()) return false;
      if (
        !force &&
        !edge &&
        first.version === view.version &&
        (view.events.length > 0 || first.total === 0)
      ) {
        if (store.state.error) store.update({ error: '' });
        return true;
      }
      if (
        mode === 'chat' &&
        !view.events.length &&
        !query &&
        offset === undefined &&
        first.next_offset !== null
      ) {
        start = Math.max(0, first.total - 150);
        first = await get(start);
        if (!valid()) return false;
      }
      let events = first.events,
        next = first.next_offset;
      // A view that already reached the live tail must keep reaching it as
      // the transcript grows, rather than stopping at its old page length.
      const refreshTail =
        !!view.data && !query && offset === undefined && view.next === null;
      while (
        !edge &&
        next !== null &&
        (refreshTail || events.length < Math.max(150, view.events.length))
      ) {
        const page = await get(next);
        if (!valid()) return false;
        events = events.concat(page.events);
        next = page.next_offset;
      }
      const canonical = first.id || id;
      if (canonical !== id) store.update({ id: canonical });
      store.updateView(
        {
          events:
            edge === 'before'
              ? events.concat(view.events)
              : edge === 'after'
                ? view.events.concat(events)
                : events,
          data: first,
          offset: edge === 'after' ? view.offset : start,
          next: edge === 'before' ? view.next : next,
          version: first.version,
          change: edge || 'refresh',
        },
        mode,
      );
      if (
        first.session &&
        store.state.sessions.some((item) => item.id === canonical)
      ) {
        store.update({
          sessions: store.state.sessions.map((item) =>
            item.id === canonical
              ? {
                  ...first.session!,
                  search_query: item.search_query,
                  search_mode: item.search_mode,
                }
              : item,
          ),
        });
      }
      if (!store.state.sessions.some((item) => item.id === canonical)) {
        const item = first.session || { ...first, updated_at: '', count: 1 };
        store.update({ sessions: [...store.state.sessions, item] });
      }
      const project = first.session || {
        ...first,
        count: 1,
        source_id: `${first.provider}:${first.instance_id}`,
      };
      const projectKey = projectGroupKey(project);
      if (
        !store.state.projectClosed.has(projectKey) &&
        !store.state.projectOpen.has(projectKey)
      ) {
        store.update({
          projectOpen: new Set(store.state.projectOpen).add(projectKey),
        });
        void store.loadProject(project);
      }
      if (store.state.error) store.update({ error: '' });
      return true;
    } catch (error) {
      if (valid()) {
        store.update({ error: String(error) });
        store.notify(String(error), { tone: 'error' });
      }
      return false;
    } finally {
      if (background) refreshing.delete(mode);
      if (!background && generation === generations[mode])
        store.updateView({ loading: false, loadingEdge: null }, mode);
    }
  }
  return {
    loadTrace,
    invalidate() {
      generations.trace++;
      generations.chat++;
    },
  };
}
