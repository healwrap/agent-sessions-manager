import { describe, it, expect } from 'vitest';
import { SessionStore } from '../../frontend/src/state/session-store';
import type { Request, Event, Trajectory } from '../../frontend/src/lib/types';
const event = {
  ref: 'T002/A05',
  position: 601,
  turn: 2,
  kind: 'assistant',
  name: '助手',
  preview: 'reply',
  timestamp: '',
  duration_ms: null,
  status: 'completed',
} as Event;
const trajectory = {
  id: 'session',
  events: [event],
  total: 700,
  event_count: 700,
  next_offset: null,
  version: '1',
  project_id: 'project',
  turn_summaries: {},
  call_groups: {},
  overview: [],
} as unknown as Trajectory;
function harness(loaded = true, count = 1) {
  const requests: { path: string; params: Record<string, string | number> }[] =
    [];
  const api: Request = async <T>(path: string, params = {}) => {
    requests.push({ path, params });
    return (
      path === '/api/trajectory-focus'
        ? { count, span: count, first: event, middle: event }
        : trajectory
    ) as T;
  };
  const store = new SessionStore(api);
  store.update({ id: 'session', projectClosed: new Set(['project']) });
  store.updateView({ events: loaded ? [event] : [], selected: 'original' });
  return { store, requests };
}
describe('timeline navigation', () => {
  it('reads new chat records beyond the previously full last page without scrolling', async () => {
    const events = Array.from({ length: 305 }, (_, position) => ({
      ...event,
      position,
      ref: `A${position}`,
    }));
    const store = new SessionStore((async (_, params) => {
      const start = Number(params?.offset || 0),
        end = Math.min(start + 150, events.length);
      return {
        ...trajectory,
        events: events.slice(start, end),
        total: events.length,
        version: 'new',
        next_offset: end < events.length ? end : null,
      };
    }) as Request);
    store.update({
      id: 'session',
      mode: 'chat',
      projectClosed: new Set(['project']),
    });
    store.updateView({
      data: trajectory,
      version: 'old',
      offset: 100,
      events: events.slice(100, 250),
      next: null,
    });
    await store.loadTrace();
    expect(store.view.events).toEqual(events.slice(100));
    expect(store.view.next).toBeNull();
    expect(store.view.offset).toBe(100);
  });
  it('keeps a paged historical chat window instead of downloading the entire tail', async () => {
    let requests = 0;
    const store = new SessionStore((async () => {
      requests++;
      return {
        ...trajectory,
        events: Array(150).fill(event),
        version: 'new',
        next_offset: 150,
      };
    }) as Request);
    store.update({
      id: 'session',
      mode: 'chat',
      projectClosed: new Set(['project']),
    });
    store.updateView({
      data: trajectory,
      version: 'old',
      events: Array(150).fill(event),
      next: 150,
    });
    await store.loadTrace();
    expect(requests).toBe(1);
    expect(store.view.next).toBe(150);
  });
  it('remembers separate scroll positions without rerendering subscribers', () => {
    const { store } = harness();
    let updates = 0;
    store.subscribe(() => updates++);
    store.rememberScroll('trace', 1200);
    store.rememberScroll('chat', 300);
    expect(store.scrollPosition('trace')).toBe(1200);
    expect(store.scrollPosition('chat')).toBe(300);
    expect(updates).toBe(0);
  });
  it('keeps unchanged background polls silent', async () => {
    const { store } = harness();
    store.updateView({ data: trajectory, version: '1' });
    let updates = 0;
    store.subscribe(() => updates++);
    await store.loadTrace();
    expect(updates).toBe(0);
    expect(store.view.loading).toBe(false);
  });
  it('publishes new records from background polls', async () => {
    const { store } = harness();
    store.updateView({ data: trajectory, version: 'old', events: [] });
    await store.loadTrace();
    expect(store.view.version).toBe('1');
    expect(store.view.events).toEqual([event]);
    expect(store.view.loading).toBe(false);
  });
  it('does not overlap background requests or discard their new records', async () => {
    let resolve!: (value: unknown) => void;
    let requests = 0;
    const store = new SessionStore((() => {
      requests++;
      return new Promise((done) => (resolve = done));
    }) as Request);
    store.update({ id: 'session', projectClosed: new Set(['project']) });
    store.updateView({ data: trajectory, version: 'old' });
    const pending = store.loadTrace();
    await store.loadTrace();
    expect(requests).toBe(1);
    resolve(trajectory);
    await pending;
    expect(store.view.events).toEqual([event]);
  });
  it('clears a recovered connection error even when the history is unchanged', async () => {
    const { store } = harness();
    store.update({ error: 'unavailable' });
    store.updateView({ data: trajectory, version: '1' });
    await store.loadTrace();
    expect(store.state.error).toBe('');
  });
  it('keeps a nested tool selection instead of redirecting to its outer call', async () => {
    const child = {
      ...event,
      ref: 'T001/C001.1',
      kind: 'subtool',
      parent_ref: 'T001/C001',
    } as Event;
    const store = new SessionStore((async () => ({
      event: child,
      parent_ref: child.parent_ref,
    })) as Request);
    store.update({ id: 'session' });
    await store.selectEvent(child.ref);
    expect(store.view.selected).toBe(child.ref);
    expect(store.view.detailsOpen).toBe(true);
  });
  it('resolves an old result alias to the canonical call', async () => {
    const store = new SessionStore((async () => ({
      event,
      parent_ref: event.ref,
    })) as Request);
    store.update({ id: 'session' });
    await store.selectEvent('S/old-result');
    expect(store.view.selected).toBe(event.ref);
  });
  it('focuses a loaded row without changing the selected detail', async () => {
    const { store, requests } = harness();
    await store.focusRange([0.7, 0.8], 300);
    expect(requests).toHaveLength(1);
    expect(store.view.navigation?.block).toBe('center');
    expect(store.view.selected).toBe('original');
  });
  it('loads an off-page row and aligns a tall selection at the top', async () => {
    const { store, requests } = harness(false, 40);
    await store.focusRange([0.7, 0.8], 300);
    expect(requests[1].params.offset).toBe(600);
    expect(store.view.navigation?.block).toBe('start');
  });
  it('ignores a focus response after gesture cancellation', async () => {
    let resolve!: (value: unknown) => void;
    const store = new SessionStore(
      (() => new Promise((done) => (resolve = done))) as Request,
    );
    store.update({ id: 'session' });
    const promise = store.focusRange([0.7, 0.8], 300);
    store.cancelFocus();
    resolve({ count: 1, span: 1, first: event, middle: event });
    await promise;
    expect(store.view.navigation).toBeNull();
    expect(store.view.events).toEqual([]);
  });
  it('does not replace a page when a newer gesture starts', async () => {
    let resolve!: (value: unknown) => void;
    const store = new SessionStore(
      (() => new Promise((done) => (resolve = done))) as Request,
    );
    store.update({ id: 'session' });
    let current = true;
    const promise = store.loadTrace(true, undefined, 600, () => current);
    current = false;
    resolve(trajectory);
    await promise;
    expect(store.view.events).toEqual([]);
    expect(store.view.loading).toBe(false);
  });
  it('keeps an empty range without inventing a destination', async () => {
    const { store } = harness(false, 0);
    await store.focusRange([0.7, 0.8], 300);
    expect(store.view.navigation).toBeNull();
    expect(store.state.toast).toBe('圈选范围内没有记录。');
  });
  it('ignores a delayed selection after switching sessions', async () => {
    let resolve!: (value: unknown) => void;
    const store = new SessionStore(
      (() => new Promise((done) => (resolve = done))) as Request,
    );
    store.update({ id: 'first' });
    const promise = store.selectEvent('old');
    store.update({ id: 'second' });
    resolve({ event });
    await promise;
    expect(store.view.selected).toBeNull();
  });
});
