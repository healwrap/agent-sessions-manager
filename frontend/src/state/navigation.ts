import { usesRecordedDuration } from '../lib/recorded-time';
import type { SessionStore } from './session-store';
import type { Event, Detail, FocusResult } from '../lib/types';
export function updateAddress(store: SessionStore, ref?: string) {
  if (typeof history !== 'undefined' && store.state.id)
    history.replaceState(
      null,
      '',
      '?' +
        new URLSearchParams({ id: store.state.id, ...(ref ? { ref } : {}) }),
    );
}
export function createNavigation(store: SessionStore) {
  let selectionGeneration = 0,
    focusGeneration = 0;
  function unfold(event: Event) {
    if (store.state.foldTurns !== store.state.collapsed.has(event.turn))
      store.toggleTurn(event.turn);
    if (
      ['tool', 'subtool'].includes(event.kind) &&
      event.call_group &&
      store.state.foldCalls !== store.state.expandedCalls.has(event.call_group)
    )
      store.toggleCall(event.call_group);
  }
  async function selectEvent(ref: string, jump = false, request = false) {
    const id = store.state.id;
    if (!id) return;
    const token = ++selectionGeneration;
    const current = () =>
      id === store.state.id && token === selectionGeneration;
    focusGeneration++;
    store.switchMode('trace');
    try {
      const detail = await store.api<Detail>('/api/event', { id, ref });
      if (!current()) return;
      const canonical = detail.event.ref || ref;
      store.updateView({
        selected: canonical,
        detailsOpen: true,
        requestOpen: request,
        ...(jump || request
          ? { summaryNonce: store.view.summaryNonce + 1 }
          : {}),
      });
      updateAddress(store, canonical);
      if (jump) {
        if (!store.view.events.some((e) => e.ref === canonical)) {
          store.updateView({ query: '', events: [] });
          await store.loadTrace(
            true,
            undefined,
            Math.floor(detail.event.position / 150) * 150,
            current,
          );
          if (!current()) return;
        }
        const event = store.view.events.find((e) => e.ref === canonical);
        if (event) unfold(event);
        store.updateView({
          navigation: { ref: canonical, block: 'center', nonce: Date.now() },
        });
      }
    } catch (error) {
      if (current()) store.notify(String(error));
    }
  }
  function cancelFocus() {
    focusGeneration++;
  }
  async function focusRange(range: [number, number], height: number) {
    store.updateView({ range });
    const token = ++focusGeneration,
      id = store.state.id,
      duration = usesRecordedDuration(store.state.duration, store.view.data);
    const current = () =>
      token === focusGeneration &&
      id === store.state.id &&
      store.state.mode === 'trace';
    if (!id) return;
    try {
      const data = await store.api<FocusResult>('/api/trajectory-focus', {
        id,
        start: range[0],
        end: range[1],
        mode: duration ? 'duration' : 'position',
      });
      if (!current()) return;
      if (!data.count) {
        store.notify('圈选范围内没有记录。');
        return;
      }
      const tall = data.span * 32 > height,
        target = tall ? data.first : data.middle;
      if (
        store.view.query ||
        !store.view.events.some((e) => e.ref === target.ref)
      ) {
        store.updateView({ query: '', events: [] });
        await store.loadTrace(
          true,
          undefined,
          Math.floor(target.position / 150) * 150,
          current,
        );
        if (!current()) return;
      }
      const event = store.view.events.find((e) => e.ref === target.ref);
      if (!event) return;
      unfold(event);
      store.updateView({
        navigation: {
          ref: target.ref,
          block: tall ? 'start' : 'center',
          nonce: Date.now(),
        },
      });
    } catch (error) {
      if (current()) store.notify(String(error));
    }
  }
  return {
    selectEvent,
    clearSelection(clearRange = false) {
      selectionGeneration++;
      if (clearRange) focusGeneration++;
      store.updateView(
        {
          selected: null,
          detailsOpen: false,
          requestOpen: false,
          ...(clearRange ? { range: null } : {}),
        },
        'trace',
      );
      updateAddress(store);
    },
    cancelFocus,
    focusRange,
    invalidate() {
      selectionGeneration++;
      focusGeneration++;
    },
  };
}
