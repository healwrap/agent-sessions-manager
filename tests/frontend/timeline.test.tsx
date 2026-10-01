import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { Timeline } from '../../frontend/src/components/timeline';
import {
  SessionStore,
  sessionStore,
} from '../../frontend/src/state/session-store';
import type { Trajectory } from '../../frontend/src/lib/types';

const effects = vi.hoisted(() => [] as Array<() => void | (() => void)>);

// Exercise the component's real input handlers without requiring a browser DOM.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (effect: () => void | (() => void)) => effects.push(effect),
  useRef: (current: unknown) => ({ current }),
  useState: (value: unknown) => [value, vi.fn()],
}));

function trackHarness(state = new SessionStore().state) {
  state.views.trace.data = {
    overview: [{ ref: 'T005/A01', kind: 'assistant', position: 0 }],
    event_count: 1,
  } as Trajectory;
  const element = Timeline({ state });
  const track = element.props.children.props.children[1];
  const handlers = track.props;
  let captured = false;
  let onWheel: (event: WheelEvent) => void;
  const node = {
    clientWidth: 1000,
    getBoundingClientRect: () => ({ left: 0 }),
    addEventListener: vi.fn((_name: string, listener: typeof onWheel) => {
      onWheel = listener;
    }),
    removeEventListener: vi.fn(),
    setPointerCapture: vi.fn(() => (captured = true)),
    hasPointerCapture: () => captured,
    releasePointerCapture: vi.fn(() => (captured = false)),
  };
  handlers.ref.current = node;
  const cleanups = effects.splice(0).map((effect) => effect());
  const wheel = (options: Partial<WheelEvent> = {}) => {
    const event = {
      clientX: 500,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 0,
      shiftKey: false,
      preventDefault: vi.fn(),
      ...options,
    };
    onWheel(event as WheelEvent);
    return event;
  };
  const pointer = (clientX: number, button = 0, pointerId = 1) => ({
    clientX,
    button,
    pointerId,
    currentTarget: node,
  });
  const click = () => {
    const stopPropagation = vi.fn();
    handlers.onClickCapture({ stopPropagation });
    return stopPropagation;
  };
  const marker = handlers.children[
    handlers.children.length - 1
  ][0] as ReactElement<{
    onClick: () => void;
  }>;
  return { handlers, node, pointer, click, marker, wheel, cleanups };
}

beforeEach(() => {
  vi.restoreAllMocks();
  effects.length = 0;
  sessionStore.state = new SessionStore().state;
  vi.stubGlobal('document', { getElementById: () => ({ clientHeight: 600 }) });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(sessionStore, 'cancelFocus').mockImplementation(() => {});
  vi.spyOn(sessionStore, 'updateView').mockImplementation(() => {});
  vi.spyOn(sessionStore, 'focusRange').mockResolvedValue(undefined);
  vi.spyOn(sessionStore, 'selectEvent').mockResolvedValue(undefined);
});

describe('timeline wheel navigation', () => {
  beforeEach(() => {
    sessionStore.state.views.trace.viewport = [0.25, 0.75];
  });

  it.each([
    { deltaY: 100 },
    { deltaX: 100 },
    { deltaX: 100, deltaY: 100 },
    { deltaX: 100, deltaY: 10 },
  ])('pans with Shift without zooming for either browser axis: %j', (axes) => {
    const { wheel } = trackHarness();
    const event = wheel({ ...axes, shiftKey: true });
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(sessionStore.updateView).toHaveBeenCalledWith({
      viewport: [0.3, 0.8],
    });
    expect(sessionStore.focusRange).not.toHaveBeenCalled();
    expect(sessionStore.selectEvent).not.toHaveBeenCalled();
  });

  it('pans a horizontal trackpad gesture without Shift', () => {
    const { wheel } = trackHarness();
    wheel({ deltaX: -100, deltaY: 1 });
    expect(sessionStore.updateView).toHaveBeenCalledWith({
      viewport: [0.2, 0.7],
    });
  });

  it.each([
    { deltaMode: 1, deltaY: 5 },
    { deltaMode: 2, deltaY: 0.08 },
  ])('normalizes line and page wheels: %j', (options) => {
    const { wheel } = trackHarness();
    wheel({ ...options, shiftKey: true });
    expect(sessionStore.updateView).toHaveBeenCalledWith({
      viewport: [0.29, 0.79],
    });
  });

  it.each([
    { deltaY: -2000, viewport: [0, 0.5] },
    { deltaY: 2000, viewport: [0.5, 1] },
  ])('stops at the edge while preserving zoom: %j', ({ deltaY, viewport }) => {
    const { wheel } = trackHarness();
    wheel({ deltaY, shiftKey: true });
    expect(sessionStore.updateView).toHaveBeenCalledWith({ viewport });
  });

  it('reads the current viewport for consecutive wheel gestures', () => {
    const { wheel } = trackHarness();
    vi.mocked(sessionStore.updateView).mockImplementation((patch) => {
      Object.assign(sessionStore.view, patch);
    });
    wheel({ deltaY: 100, shiftKey: true });
    wheel({ deltaX: 100, shiftKey: true });
    expect(sessionStore.view.viewport?.[0]).toBeCloseTo(0.35);
    expect(sessionStore.view.viewport?.[1]).toBeCloseTo(0.85);
  });

  it('keeps an ordinary vertical wheel zoom anchored at the pointer', () => {
    const { wheel } = trackHarness();
    wheel({ deltaY: -100 });
    const [start, end] = vi.mocked(sessionStore.updateView).mock.calls[0][0]
      .viewport!;
    expect(end - start).toBeCloseTo(0.409365);
    expect((start + end) / 2).toBeCloseTo(0.5);
  });

  it('ignores empty gestures and a hidden track without cancelling navigation', () => {
    const { wheel, node } = trackHarness();
    wheel({ shiftKey: true });
    node.clientWidth = 0;
    wheel({ deltaY: 100, shiftKey: true });
    expect(sessionStore.updateView).not.toHaveBeenCalled();
    expect(sessionStore.cancelFocus).not.toHaveBeenCalled();
  });

  it('removes the non-passive wheel listener when the track unmounts', () => {
    const { node, cleanups } = trackHarness();
    expect(node.addEventListener).toHaveBeenCalledWith(
      'wheel',
      expect.any(Function),
      { passive: false },
    );
    cleanups.forEach((cleanup) => cleanup?.());
    expect(node.removeEventListener).toHaveBeenCalledWith(
      'wheel',
      node.addEventListener.mock.calls[0][1],
    );
  });
});

describe('timeline pointer navigation', () => {
  it('clears only the selection on double-click, preserving zoom, position and detail', () => {
    sessionStore.view.viewport = [0.25, 0.75];
    sessionStore.view.range = [0.4, 0.5];
    sessionStore.view.selected = 'T005/A01';
    const { handlers } = trackHarness(sessionStore.state);
    vi.mocked(sessionStore.updateView).mockImplementation((patch) => {
      Object.assign(sessionStore.view, patch);
    });
    handlers.onDoubleClick();
    expect(sessionStore.view.range).toBeNull();
    expect(sessionStore.view.viewport).toEqual([0.25, 0.75]);
    expect(sessionStore.view.selected).toBe('T005/A01');
    expect(sessionStore.cancelFocus).toHaveBeenCalledOnce();
    expect(sessionStore.focusRange).not.toHaveBeenCalled();
  });

  it('keeps marker clicks on the marker instead of capturing them on the track', () => {
    const { handlers, node, pointer, click, marker } = trackHarness();
    handlers.onPointerDown(pointer(0));
    handlers.onPointerUp(pointer(0));
    expect(node.setPointerCapture).not.toHaveBeenCalled();
    expect(node.releasePointerCapture).not.toHaveBeenCalled();
    expect(click()).not.toHaveBeenCalled();
    marker.props.onClick();
    expect(sessionStore.selectEvent).toHaveBeenCalledWith('T005/A01', true);
  });

  it('tolerates small mouse movement while clicking', () => {
    const { handlers, node, pointer, click } = trackHarness();
    handlers.onPointerDown(pointer(0));
    handlers.onPointerMove(pointer(3));
    handlers.onPointerUp(pointer(3));
    expect(node.setPointerCapture).not.toHaveBeenCalled();
    expect(sessionStore.focusRange).not.toHaveBeenCalled();
    expect(click()).not.toHaveBeenCalled();
  });

  it('captures an actual drag and suppresses only its follow-up click', () => {
    const { handlers, node, pointer, click } = trackHarness();
    handlers.onPointerDown(pointer(0));
    handlers.onPointerMove(pointer(4));
    expect(node.setPointerCapture).toHaveBeenCalledWith(1);
    handlers.onPointerLeave(pointer(4));
    handlers.onPointerUp(pointer(10));
    expect(sessionStore.focusRange).toHaveBeenCalledWith([0, 1], 600);
    expect(node.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(click()).toHaveBeenCalledOnce();
    expect(click()).not.toHaveBeenCalled();
  });

  it('still treats a drag as a drag when the pointer returns to its start', () => {
    const { handlers, pointer, click } = trackHarness();
    handlers.onPointerDown(pointer(0));
    handlers.onPointerMove(pointer(10));
    handlers.onPointerMove(pointer(0));
    handlers.onPointerUp(pointer(0));
    expect(sessionStore.focusRange).toHaveBeenCalledWith([0, 0], 600);
    expect(click()).toHaveBeenCalledOnce();
  });

  it('preserves right-button panning without selecting a range', () => {
    sessionStore.view.viewport = [0.25, 0.75];
    sessionStore.view.range = [0.4, 0.5];
    const { handlers, node, pointer } = trackHarness(sessionStore.state);
    handlers.onPointerDown(pointer(0, 2));
    expect(node.setPointerCapture).toHaveBeenCalledWith(1);
    handlers.onPointerMove(pointer(10, 2));
    handlers.onPointerUp(pointer(10, 2));
    expect(sessionStore.updateView).toHaveBeenCalledWith({
      viewport: [0, 0.5],
    });
    expect(sessionStore.view.range).toEqual([0.4, 0.5]);
    expect(node.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(sessionStore.focusRange).not.toHaveBeenCalled();
    expect(sessionStore.selectEvent).not.toHaveBeenCalled();
  });

  it('clears a pending click when the pointer leaves before a drag starts', () => {
    const { handlers, node, pointer } = trackHarness();
    handlers.onPointerDown(pointer(0));
    handlers.onPointerLeave(pointer(1));
    handlers.onPointerMove(pointer(10));
    handlers.onPointerUp(pointer(10));
    expect(node.setPointerCapture).not.toHaveBeenCalled();
    expect(sessionStore.focusRange).not.toHaveBeenCalled();
  });

  it('does not swallow the next marker click after a cancelled drag', () => {
    const { handlers, pointer, click } = trackHarness();
    handlers.onPointerDown(pointer(0));
    handlers.onPointerMove(pointer(10));
    handlers.onPointerCancel();
    handlers.onPointerDown(pointer(0));
    handlers.onPointerUp(pointer(0));
    expect(click()).not.toHaveBeenCalled();
    expect(sessionStore.focusRange).not.toHaveBeenCalled();
  });
});
