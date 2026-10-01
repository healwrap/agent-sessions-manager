import type { SessionStore } from './session-store';
import type { Trajectory } from '../lib/types';
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
    if (!id) return;
    const background = !force && !edge && !!store.state.views[mode].data;
    if (background && refreshing.has(mode)) return;
    if (background) refreshing.add(mode);
    const generation = ++generations[mode],
      view = store.state.views[mode],
      query = view.query;
    const valid = () =>
      generation === generations[mode] && id === store.state.id && current();
    if (!background) store.updateView({ loading: true }, mode);
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
      if (!valid()) return;
      if (!force && !edge && first.version === view.version) {
        if (store.state.error) store.update({ error: '' });
        return;
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
        if (!valid()) return;
      }
      let events = first.events,
        next = first.next_offset;
      // A view that already reached the live tail must keep reaching it as
      // the transcript grows, rather than stopping at its old page length.
      const refreshTail =
        mode === 'chat' && !query && offset === undefined && view.next === null;
      while (
        !edge &&
        next !== null &&
        (refreshTail || events.length < Math.max(150, view.events.length))
      ) {
        const page = await get(next);
        if (!valid()) return;
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
      if (!store.state.sessions.some((item) => item.id === canonical)) {
        const item = { ...first, updated_at: '', count: 1 };
        store.update({ sessions: [...store.state.sessions, item] });
      }
      if (
        !store.state.projectClosed.has(first.project_id) &&
        !store.state.projectOpen.has(first.project_id)
      ) {
        store.update({
          projectOpen: new Set(store.state.projectOpen).add(first.project_id),
        });
        void store.loadProject(first.project_id);
      }
      if (store.state.error) store.update({ error: '' });
    } catch (error) {
      if (valid()) {
        store.update({ error: String(error) });
        store.notify(String(error));
      }
    } finally {
      if (background) refreshing.delete(mode);
      if (!background && generation === generations[mode])
        store.updateView({ loading: false }, mode);
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
