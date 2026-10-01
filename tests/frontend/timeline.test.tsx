import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { Timeline } from '../../frontend/src/components/timeline';
import {
  SessionStore,
  sessionStore,
} from '../../frontend/src/state/session-store';
import type { Trajectory } from '../../frontend/src/lib/types';

// Exercise the component's real pointer handlers without requiring a browser DOM.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: () => {},
  useRef: (current: unknown) => ({ current }),
  useState: (value: unknown) => [value, vi.fn()],
}));

function trackHarness() {
  const state = new SessionStore().state;
  state.views.trace.data = {
    overview: [{ ref: 'T005/A01', kind: 'assistant', position: 0 }],
    event_count: 1,
  } as Trajectory;
  const element = Timeline({ state });
  const track = element.props.children.props.children[1];
  const handlers = track.props;
  let captured = false;
  const node = {
    getBoundingClientRect: () => ({ left: 0 }),
    setPointerCapture: vi.fn(() => (captured = true)),
    hasPointerCapture: () => captured,
    releasePointerCapture: vi.fn(() => (captured = false)),
  };
  handlers.ref.current = node;
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
  const marker = handlers.children[1][0] as ReactElement<{
    onClick: () => void;
  }>;
  return { handlers, node, pointer, click, marker };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('document', { getElementById: () => ({ clientHeight: 600 }) });
  vi.spyOn(sessionStore, 'cancelFocus').mockImplementation(() => {});
  vi.spyOn(sessionStore, 'updateView').mockImplementation(() => {});
  vi.spyOn(sessionStore, 'focusRange').mockResolvedValue(undefined);
  vi.spyOn(sessionStore, 'selectEvent').mockResolvedValue(undefined);
});

describe('timeline pointer navigation', () => {
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
    const { handlers, node, pointer } = trackHarness();
    handlers.onPointerDown(pointer(0, 2));
    expect(node.setPointerCapture).toHaveBeenCalledWith(1);
    handlers.onPointerMove(pointer(10, 2));
    handlers.onPointerUp(pointer(10, 2));
    expect(sessionStore.updateView).toHaveBeenCalled();
    expect(sessionStore.focusRange).not.toHaveBeenCalled();
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
