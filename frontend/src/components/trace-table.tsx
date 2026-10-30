import { recordType } from '../lib/record-presentation';
import { usesRecordedDuration } from '../lib/recorded-time';
import { useRef, type CSSProperties } from 'react';
import { sessionStore, type AppState } from '../state/session-store';
import { timelineRange } from '../lib/timeline-projection';
import { trajectoryRows } from '../lib/selectors';
import { statusLabels } from '../lib/types';
import { useHistoryScroll } from '../hooks/use-history-scroll';
import { Icon } from './primitives';
import { eventLabel } from '../lib/event-presentation';
import { requestBoundaryLayout } from '../lib/trace-layout';
import { HistoryLoadRow } from './history-load-row';
import { TrajectoryLoading } from './trajectory-loading';
export function TraceTable({ state }: { state: AppState }) {
  const ref = useRef<HTMLElement>(null),
    view = state.views.trace;
  useHistoryScroll(ref, view, 'trace', state.mode === 'trace', state.id);
  const rows = trajectoryRows(
    view.events,
    view.data,
    view.query,
    state.foldTurns,
    state.collapsed,
    state.foldCalls,
    state.expandedCalls,
  );
  const overview = view.data?.overview || view.events,
    { boundaries, offsets } = requestBoundaryLayout(overview, rows),
    activeTurn = view.detailsOpen
      ? overview.find((event) => event.ref === view.selected)?.turn
      : undefined;
  let previousTurn: number | null = null;
  return (
    <section
      ref={ref}
      className="tablePane"
      id="table-pane"
      aria-label="轨迹记录"
      aria-busy={view.loading}
      onClick={(event) => {
        if (event.target === event.currentTarget)
          sessionStore.clearSelection(true);
      }}
    >
      {!!rows.length && view.loading && !view.loadingEdge && (
        <TrajectoryLoading />
      )}
      <table className="table" data-scroll-ready="true">
        <colgroup>
          <col className="eventColumn" />
          <col className="contentColumn" />
        </colgroup>
        <tbody>
          {!!rows.length && view.offset > 0 && (
            <HistoryLoadRow
              direction="before"
              loading={view.loading}
              active={view.loading && view.loadingEdge === 'before'}
            />
          )}
          {rows.map((event, index) => {
            const initialSystem =
              !('summaryType' in event) &&
              previousTurn === null &&
              recordType(event) === 'system_prompt';
            const first = !initialSystem && previousTurn !== event.turn;
            if (!initialSystem) previousTurn = event.turn;
            if ('summaryType' in event) {
              const expand = () =>
                event.summaryType === 'turn'
                  ? sessionStore.toggleTurn(event.turn)
                  : sessionStore.toggleCall(event.group!);
              return (
                <tr
                  key={event.ref}
                  className="summary-row"
                  data-scroll-anchor={event.ref}
                  tabIndex={0}
                  data-collapsed-summary={
                    event.summaryType === 'call' ? 'assistant' : 'turn'
                  }
                  onClick={expand}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      expand();
                    }
                  }}
                >
                  <td className="event">
                    {activeTurn === event.turn && (
                      <span className="turnRail" aria-hidden="true" />
                    )}
                  </td>
                  <td className="content">
                    <button className="fold-summary" data-tooltip="展开记录">
                      <span className="summary-ellipsis">…</span>
                      {event.preview}
                    </button>
                  </td>
                </tr>
              );
            }
            const selected =
                event.ref === view.selected &&
                !view.requestOpen &&
                !event.request_only,
              requestSelected =
                event.ref === view.selected &&
                (view.requestOpen || event.request_only),
              tool = ['tool', 'subtool'].includes(event.kind),
              execution = recordType(event) === 'execution_result';
            const [label, color] = eventLabel(event);
            const [start, end] = timelineRange(
              event,
              view.data?.timeline_count ?? view.data?.event_count ?? 1,
              usesRecordedDuration(state.duration, view.data),
            );
            const outside =
              view.range && (end < view.range[0] || start > view.range[1]);
            const select = () => void sessionStore.selectEvent(event.ref);
            return (
              <tr
                key={event.ref}
                data-ref={event.ref}
                data-kind={event.kind}
                data-request-only={event.request_only || undefined}
                data-terminal-request-boundary={
                  (event.request_only && index === rows.length - 1) || undefined
                }
                data-turn-start={first}
                data-turn-end={rows[index + 1]?.turn !== event.turn}
                data-selected={selected}
                data-error={event.status === 'error'}
                data-timeline-focus={outside ? 'outside' : 'inside'}
                tabIndex={event.request_only ? -1 : 0}
                data-tooltip={event.ref + ' · ' + event.name}
                onClick={event.request_only ? undefined : select}
                onDoubleClick={(e) => {
                  if (
                    event.request_only ||
                    view.query ||
                    (e.target instanceof Element && e.target.closest('button'))
                  )
                    return;
                  if (event.kind === 'assistant' && event.call_summary)
                    sessionStore.toggleCall(event.call_summary);
                  else if (
                    first &&
                    (view.data?.turn_summaries[event.turn]?.remaining || 0) > 0
                  )
                    sessionStore.toggleTurn(event.turn);
                }}
                onKeyDown={(e) => {
                  if (
                    !event.request_only &&
                    (e.key === 'Enter' || e.key === ' ')
                  ) {
                    e.preventDefault();
                    select();
                  }
                }}
              >
                <td className="event">
                  {event.request_number != null &&
                    boundaries.get(event.request_number) === event.ref && (
                      <button
                        type="button"
                        className={
                          'requestBoundaryControl' +
                          (requestSelected
                            ? ' requestBoundaryControlActive'
                            : '')
                        }
                        aria-label={`请求 #${event.request_number}${recordType(event) === 'compaction' ? ' · 压缩' : ''}`}
                        aria-pressed={requestSelected}
                        data-request-run-index={
                          (offsets.get(event.ref) || 0) / 8
                        }
                        style={
                          {
                            '--request-boundary-offset':
                              (offsets.get(event.ref) || 0) + 'px',
                          } as CSSProperties
                        }
                        data-label={`请求 #${event.request_number}${recordType(event) === 'compaction' ? ' · 压缩' : ''}`}
                        data-request-status={event.status}
                        onClick={(e) => {
                          e.stopPropagation();
                          void sessionStore.selectEvent(event.ref, false, true);
                        }}
                        onDoubleClick={(event) => event.stopPropagation()}
                      />
                    )}
                  {!initialSystem && activeTurn === event.turn && (
                    <span className="turnRail" aria-hidden="true" />
                  )}
                  {selected && <span className="selectionRail" />}
                  {event.request_only ? null : first ? (
                    <button
                      className={
                        'turnLabel' +
                        (activeTurn === event.turn ? ' turnLabelActive' : '')
                      }
                      aria-label={`第 ${event.turn} 轮`}
                      data-tooltip={
                        state.foldTurns !== state.collapsed.has(event.turn)
                          ? '展开轮次'
                          : '收起轮次'
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        sessionStore.toggleTurn(event.turn);
                      }}
                    >
                      <span className="turnLabelFull" aria-hidden="true">
                        第 {event.turn} 轮
                      </span>
                      <span className="turnLabelCompact" aria-hidden="true">
                        #{event.turn}
                      </span>
                    </button>
                  ) : null}
                  {!event.request_only && (
                    <div className="eventInner">
                      <span className="kindSlot">
                        <span
                          className={
                            'kindTag ' + (execution ? 'toolAmber' : color)
                          }
                          data-role-kind={
                            event.kind === 'assistant' ? 'message' : event.kind
                          }
                        >
                          <span
                            className="kindTagIcon"
                            aria-hidden="true"
                            data-tooltip={label}
                          >
                            <Icon
                              name={
                                tool || execution
                                  ? 'wrench'
                                  : event.kind === 'user'
                                    ? 'user'
                                    : event.kind === 'assistant'
                                      ? 'sparkle'
                                      : 'context'
                              }
                            />
                          </span>
                          <span className="kindTagLabel">
                            {execution ? '执行结果' : label}
                          </span>
                        </span>
                      </span>
                    </div>
                  )}
                </td>
                <td className="content">
                  {tool ? (
                    <div className="resultPreview">
                      <div className="resultRequest">
                        <span className="toolCallNameTypeface">
                          {event.program_summary != null && (
                            <span className="programIcon">{'</>'}</span>
                          )}
                          {event.name}
                        </span>
                        <span
                          className={
                            event.program_summary != null
                              ? 'programSummary'
                              : 'toolCallPayload'
                          }
                        >
                          {event.program_summary ?? event.preview}
                        </span>
                      </div>
                      {event.status !== 'unread' && (
                        <div className="inlineResult">
                          {event.output_preview != null ? (
                            <span className="arrow">→</span>
                          ) : (
                            <Icon name="right" className="arrow" />
                          )}
                          <span
                            className={
                              'inlineResultText' +
                              (event.status === 'error' ? ' error' : '')
                            }
                          >
                            {event.output_preview ??
                              (event.kind === 'subtool' &&
                              event.status === 'unmatched'
                                ? '查看组合调用'
                                : statusLabels[event.status] || event.status)}
                            {event.output_preview == null && event.output_chars
                              ? ` · ${event.output_chars.toLocaleString()} 字符`
                              : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="contentText">{event.preview}</div>
                  )}
                </td>
              </tr>
            );
          })}
          {!!rows.length && view.next !== null && (
            <HistoryLoadRow
              direction="after"
              loading={view.loading}
              active={view.loading && view.loadingEdge === 'after'}
            />
          )}
        </tbody>
      </table>
      {!rows.length &&
        (view.loading ? (
          <TrajectoryLoading empty />
        ) : (
          <div className="empty-message">
            {state.error ||
              view.data?.unavailable_reason ||
              '没有匹配的轨迹记录。'}
            {state.error && (
              <button
                className="trajectory-retry"
                onClick={() => void sessionStore.loadTrace(true)}
              >
                重新加载
              </button>
            )}
          </div>
        ))}
    </section>
  );
}
