import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { usesRecordedDuration } from '../lib/recorded-time';
import { assistantWaitRatio } from '../lib/event-presentation';
import { recordType } from '../lib/record-presentation';
import { useTimelineTooltip } from '../hooks/use-timeline-tooltip';
import { TimelineTooltip } from './timeline-tooltip';
import { sessionStore, type AppState } from '../state/session-store';
import {
  timelineRange,
  nearestTimelineEvent,
} from '../lib/timeline-projection';
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
    suppress = useRef(false),
    hoverLine = useRef<HTMLDivElement>(null);
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
    tooltip = useTimelineTooltip(
      JSON.stringify([state.id, view.version, viewport]),
      panning || draft !== null,
    ),
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
      tooltip.dismiss();
      const width = node.clientWidth;
      if (!width) return;
      const unit =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? width : 1;
      // Shift wheels can arrive on either axis after the browser's conversion.
      const horizontal =
          event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY),
        delta =
          (horizontal && Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? event.deltaX
            : event.deltaY) * unit;
      if (!delta) return;
      sessionStore.cancelFocus();
      const [start, end] = sessionStore.view.viewport || [0, 1],
        size = end - start,
        ratio = (event.clientX - node.getBoundingClientRect().left) / width;
      if (horizontal) {
        const offset = (delta / width) * size;
        sessionStore.updateView({
          viewport: bounded(start + offset, end + offset),
        });
      } else {
        const nextSize = Math.min(
          1,
          Math.max(0.005, size * Math.exp(delta * 0.002)),
        );
        const nextStart = start + ratio * (size - nextSize);
        sessionStore.updateView({
          viewport: bounded(nextStart, nextStart + nextSize),
        });
      }
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [tooltip.dismiss]);
  const range = draft || view.range,
    events = view.data?.overview || [],
    total = view.data?.event_count || 1,
    duration = usesRecordedDuration(state.duration, view.data);
  const turns = new Map<number, number>();
  for (const event of events) {
    const start = timelineRange(event, total, duration)[0];
    turns.set(event.turn, Math.min(turns.get(event.turn) ?? Infinity, start));
  }
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
          tabIndex={0}
          aria-label="时间线概览；拖动选择范围，滚轮缩放，Shift＋滚轮或按住右键拖动平移，双击取消圈选并保留缩放位置"
          title="滚轮缩放 · Shift＋滚轮或按住右键拖动平移 · 双击取消圈选"
          data-panning={panning}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || !range) return;
            event.preventDefault();
            sessionStore.cancelFocus();
            sessionStore.updateView({ range: null });
            setDraft(null);
          }}
          onContextMenu={(event) => event.preventDefault()}
          onDoubleClick={() => {
            sessionStore.cancelFocus();
            sessionStore.updateView({ range: null });
            setDraft(null);
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 && event.button !== 2) return;
            tooltip.dismiss();
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
            if (hoverLine.current) {
              hoverLine.current.style.left =
                left(position(event.clientX)) + 'px';
              hoverLine.current.style.opacity = '1';
            }
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
            if (hoverLine.current) hoverLine.current.style.opacity = '0';
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
          onClick={(event) => {
            if (event.target !== event.currentTarget || event.detail > 1)
              return;
            const nearest = nearestTimelineEvent(
              events,
              position(event.clientX),
              total,
              duration,
            );
            if (nearest)
              void sessionStore.selectEvent(nearest.ref, true);
          }}
          onClickCapture={(event) => {
            if (suppress.current) {
              event.stopPropagation();
              suppress.current = false;
            }
          }}
        >
          <div ref={hoverLine} className="timeline-hover-line" />
          {[...turns]
            .filter(
              ([, start]) =>
                start > 0 && start >= viewport[0] && start <= viewport[1],
            )
            .map(([turn, start]) => (
              <div
                key={turn}
                className="timeline-turn-boundary"
                data-turn={turn}
                style={{ left: left(start) }}
              />
            ))}
          {range &&
            ['timeline-selection', 'timeline-selection-edges'].map(
              (className) => (
                <div
                  key={className}
                  className={className}
                  data-dragging={draft !== null || undefined}
                  aria-hidden="true"
                  style={{
                    left: left(range[0]),
                    width: left(range[1]) - left(range[0]),
                  }}
                />
              ),
            )}
          {events.map((event) => {
            const [start, end] = timelineRange(event, total, duration);
            if (end < viewport[0] || start > viewport[1]) return null;
            const type = recordType(event),
              execution = type === 'execution_result',
              compaction = type === 'compaction',
              system = type === 'system_prompt' || type === 'tool_definitions';
            const waitRatio = assistantWaitRatio(event);
            const lane =
                event.kind === 'assistant' || compaction
                  ? 1
                  : ['tool', 'subtool'].includes(event.kind) || execution
                    ? 2
                    : 0,
              kind =
                event.kind === 'assistant' || compaction
                  ? 'message'
                  : system
                    ? 'system'
                    : execution
                      ? 'tool'
                      : event.kind;
            const spanWidth = Math.max(2, left(end) - left(start));
            const pixelLeft = left(start);
            return (
              <button
                key={event.ref}
                className="TrajectoryTimeline-span"
                style={
                  {
                    '--trajectory-span-lane': lane,
                    '--trajectory-assistant-ttft':
                      waitRatio == null ? undefined : waitRatio + '%',
                    '--trajectory-span-left': pixelLeft + 'px',
                    '--trajectory-span-width': spanWidth + 'px',
                    '--trajectory-span-gap':
                      Math.min(spanWidth * 0.08, 1) + 'px',
                  } as CSSProperties
                }
                data-timeline-span={kind}
                data-assistant-timing={waitRatio != null}
                data-current={event.ref === view.selected || undefined}
                data-selected={!range || (end >= range[0] && start <= range[1])}
                data-error={event.status === 'error'}
                data-search-match={!view.query || event.search_match !== false}
                aria-label={'定位 ' + event.ref}
                onMouseEnter={(action) =>
                  tooltip.show(action.currentTarget, event)
                }
                onMouseLeave={tooltip.dismiss}
                onFocus={(action) => {
                  if (action.currentTarget.matches(':focus-visible'))
                    tooltip.show(action.currentTarget, event, 0);
                }}
                onBlur={tooltip.dismiss}
                aria-describedby={
                  tooltip.hint?.record === event.ref
                    ? tooltip.hint.id
                    : undefined
                }
                onClick={() => {
                  tooltip.dismiss();
                  void sessionStore.selectEvent(event.ref, true);
                }}
              />
            );
          })}
        </div>
      </div>
      <TimelineTooltip hint={tooltip.hint} />
    </div>
  );
}
