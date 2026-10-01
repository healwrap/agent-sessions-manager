import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { sessionStore, type AppState } from '../state/session-store';
import { positionOf } from '../lib/selectors';
function bounded(start: number, end: number): [number, number] {
  const size = Math.min(1, Math.max(0.005, end - start)),
    left = Math.max(0, Math.min(1 - size, start));
  return [left, left + size];
}
export function Timeline({ state }: { state: AppState }) {
  const view = state.views.trace,
    ref = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(1),
    [draft, setDraft] = useState<[number, number] | null>(null),
    [panning, setPanning] = useState(false),
    suppress = useRef(false);
  const drag = useRef<{
    pointerId: number;
    x: number;
    at: number;
    pan: boolean;
    moved: boolean;
    viewport: [number, number];
    range: [number, number] | null;
  } | null>(null);
  const viewport = view.viewport || [0, 1],
    size = viewport[1] - viewport[0],
    position = (x: number) =>
      Math.max(
        0,
        Math.min(
          1,
          viewport[0] +
            ((x - ref.current!.getBoundingClientRect().left) / width) * size,
        ),
      );
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      sessionStore.cancelFocus();
      const [start, end] = sessionStore.view.viewport || [0, 1],
        size = end - start,
        ratio =
          (event.clientX - node.getBoundingClientRect().left) /
          node.clientWidth;
      if (event.shiftKey) {
        const delta = (event.deltaY / node.clientWidth) * size;
        sessionStore.updateView({
          viewport: bounded(start + delta, end + delta),
        });
      } else {
        const nextSize = Math.min(
          1,
          Math.max(0.005, size * Math.exp(event.deltaY * 0.002)),
        );
        const nextStart = start + ratio * (size - nextSize);
        sessionStore.updateView({
          viewport: bounded(nextStart, nextStart + nextSize),
        });
      }
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, []);
  const range = draft || view.range,
    events = view.data?.overview || [],
    total = view.data?.event_count || 1;
  const left = (value: number) => ((value - viewport[0]) / size) * width;
  return (
    <div className="trajectory-timeline" aria-label="轨迹时间线">
      <div className="TrajectoryTimeline-plot">
        <div className="TrajectoryTimeline-labels">
          <span>输入</span>
          <span>模型</span>
          <span>工具</span>
        </div>
        <div
          ref={ref}
          className="TrajectoryTimeline-track"
          aria-label="时间线概览；拖动选择范围，滚轮缩放，右键拖动平移，双击复原"
          data-panning={panning}
          onContextMenu={(event) => event.preventDefault()}
          onDoubleClick={() => {
            sessionStore.cancelFocus();
            sessionStore.updateView({ range: null, viewport: null });
            setDraft(null);
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 && event.button !== 2) return;
            sessionStore.cancelFocus();
            suppress.current = false;
            drag.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              at: position(event.clientX),
              pan: event.button === 2,
              moved: false,
              viewport: [...viewport],
              range: view.range,
            };
            setPanning(event.button === 2);
            // Capturing a marker's pointer here would retarget its click to the track.
            if (event.button === 2)
              event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const active = drag.current;
            if (!active || active.pointerId !== event.pointerId) return;
            if (Math.abs(event.clientX - active.x) >= 4) active.moved = true;
            if (
              active.moved &&
              !event.currentTarget.hasPointerCapture(event.pointerId)
            )
              event.currentTarget.setPointerCapture(event.pointerId);
            if (active.pan) {
              const delta =
                ((active.x - event.clientX) / width) *
                (active.viewport[1] - active.viewport[0]);
              sessionStore.updateView({
                viewport: bounded(
                  active.viewport[0] + delta,
                  active.viewport[1] + delta,
                ),
              });
            } else if (active.moved)
              setDraft([
                Math.min(active.at, position(event.clientX)),
                Math.max(active.at, position(event.clientX)),
              ]);
          }}
          onPointerUp={(event) => {
            const active = drag.current;
            if (!active || active.pointerId !== event.pointerId) return;
            drag.current = null;
            setPanning(false);
            suppress.current = active.pan || active.moved;
            if (!active.pan && suppress.current) {
              const range: [number, number] = [
                Math.min(active.at, position(event.clientX)),
                Math.max(active.at, position(event.clientX)),
              ];
              setDraft(null);
              void sessionStore.focusRange(
                range,
                document.getElementById('table-pane')?.clientHeight || 600,
              );
            }
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerLeave={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId))
              drag.current = null;
          }}
          onPointerCancel={() => {
            const active = drag.current;
            drag.current = null;
            suppress.current = false;
            setDraft(null);
            setPanning(false);
            sessionStore.cancelFocus();
            if (active)
              sessionStore.updateView({
                range: active.range,
                viewport: active.viewport,
              });
          }}
          onClickCapture={(event) => {
            if (suppress.current) {
              event.stopPropagation();
              suppress.current = false;
            }
          }}
        >
          {range && (
            <div
              className="timeline-selection"
              style={{
                left: left(range[0]),
                width: left(range[1]) - left(range[0]),
              }}
            />
          )}
          {events.map((event) => {
            const start = positionOf(event, total, state.duration),
              end = state.duration
                ? (event.timeline_end ?? start)
                : start + 1 / Math.max(total, 1);
            if (end < viewport[0] || start > viewport[1]) return null;
            const execution =
              event.kind === 'context' && event.name === '执行记录';
            const lane =
                event.kind === 'assistant'
                  ? 1
                  : ['tool', 'subtool'].includes(event.kind) || execution
                    ? 2
                    : 0,
              kind =
                event.kind === 'assistant'
                  ? 'message'
                  : execution
                    ? 'tool'
                    : event.kind;
            const spanWidth = state.duration
              ? Math.max(2, left(end) - left(start))
              : 8;
            const pixelLeft = Math.min(width - spanWidth, left(start));
            return (
              <button
                key={event.ref}
                className="TrajectoryTimeline-span"
                style={
                  {
                    '--trajectory-span-lane': lane,
                    '--trajectory-span-left': pixelLeft + 'px',
                    '--trajectory-span-width': spanWidth + 'px',
                    '--trajectory-span-gap': state.duration ? '1px' : '0px',
                  } as CSSProperties
                }
                data-timeline-span={kind}
                data-current={
                  event.ref === view.selected ||
                  !!view.events.find(
                    (e) =>
                      e.ref === view.selected &&
                      (e.parent_ref === event.ref ||
                        (e.kind === event.kind &&
                          e.position >= event.position &&
                          e.position <=
                            (event.end_position ?? event.position))),
                  )
                }
                data-selected={!range || (end >= range[0] && start <= range[1])}
                data-error={event.status === 'error'}
                data-search-match={!view.query || event.search_match !== false}
                title={
                  event.ref +
                  (event.count && event.count > 1
                    ? ` · ${event.count} 条记录`
                    : '') +
                  (event.name ? ' · ' + event.name : '')
                }
                aria-label={'定位 ' + event.ref}
                onClick={() =>
                  void sessionStore.selectEvent(
                    event.parent_ref || event.ref,
                    true,
                  )
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
