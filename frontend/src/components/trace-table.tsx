import { recordType } from '../lib/record-presentation';
import { usesRecordedDuration } from '../lib/recorded-time';
import { useRef } from 'react';
import { sessionStore, type AppState } from '../state/session-store';
import { timelineRange } from '../lib/timeline-projection';
import { trajectoryRows } from '../lib/selectors';
import { statusLabels } from '../lib/types';
import { useHistoryScroll } from '../hooks/use-history-scroll';
import { Icon } from './primitives';
import { eventLabel } from '../lib/event-presentation';
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
  const requestBoundaries = new Map<number, string>();
  {
    for (const event of view.data?.overview || view.events) {
      if (
        event.request_number == null ||
        requestBoundaries.has(event.request_number) ||
        (['user', 'context'].includes(event.kind) &&
          recordType(event) !== 'compaction')
      )
        continue;
      requestBoundaries.set(event.request_number, event.ref);
    }
  }
  let previousTurn: number | null = null;
  return (
    <section
      ref={ref}
      className="tablePane"
      id="table-pane"
      aria-label="轨迹记录"
    >
      <table className="table" data-scroll-ready="true">
        <colgroup>
          <col className="eventColumn" />
          <col className="contentColumn" />
        </colgroup>
        <tbody>
          {rows.map((event) => {
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
                  : sessionStore.update({
                      expandedCalls: new Set(state.expandedCalls).add(
                        event.group!,
                      ),
                    });
              return (
                <tr
                  key={event.ref}
                  className="summary-row"
                  tabIndex={0}
                  data-collapsed-summary={event.summaryType}
                  onClick={expand}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      expand();
                    }
                  }}
                >
                  <td className="event">
                    <span className="step-dot" />
                  </td>
                  <td className="content">
                    <button className="fold-summary" title="展开记录">
                      <span className="summary-ellipsis">…</span>
                      {event.preview}
                    </button>
                  </td>
                </tr>
              );
            }
            const selected = event.ref === view.selected,
              tool = ['tool', 'subtool'].includes(event.kind),
              execution = recordType(event) === 'execution_result';
            const [label, color] = eventLabel(event);
            const [start, end] = timelineRange(
              event,
              view.data?.event_count || 1,
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
                data-turn-start={first}
                data-selected={selected}
                data-error={event.status === 'error'}
                data-timeline-focus={outside ? 'outside' : 'inside'}
                tabIndex={0}
                title={event.ref + ' · ' + event.name}
                onClick={select}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    select();
                  }
                }}
              >
                <td className="event">
                  {event.request_number != null &&
                    requestBoundaries.get(event.request_number) ===
                      event.ref && (
                      <button
                        type="button"
                        className={
                          'requestBoundaryControl' +
                          (selected && view.requestOpen
                            ? ' requestBoundaryControlActive'
                            : '')
                        }
                        aria-label={`请求 #${event.request_number}${recordType(event) === 'compaction' ? ' · 压缩' : ''}`}
                        aria-pressed={selected && view.requestOpen}
                        data-label={`请求 #${event.request_number}${recordType(event) === 'compaction' ? ' · 压缩' : ''}`}
                        data-request-status={event.status}
                        onClick={(e) => {
                          e.stopPropagation();
                          void sessionStore.selectEvent(event.ref, false, true);
                        }}
                      />
                    )}
                  <span className="turnRail" />
                  {selected && <span className="selectionRail" />}
                  {first ? (
                    <button
                      className={
                        'turnLabel' + (selected ? ' turnLabelActive' : '')
                      }
                      title={
                        state.foldTurns !== state.collapsed.has(event.turn)
                          ? '展开轮次'
                          : '收起轮次'
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        sessionStore.toggleTurn(event.turn);
                      }}
                    >
                      第 {event.turn} 轮
                    </button>
                  ) : (
                    <span className="step-dot" />
                  )}
                  <div className="eventInner">
                    <span className="kindSlot">
                      <span
                        className={
                          'kindTag ' + (execution ? 'toolAmber' : color)
                        }
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
                          className="kindTagIcon"
                        />
                        <span className="kindTagLabel">
                          {execution ? '执行结果' : label}
                        </span>
                      </span>
                    </span>
                  </div>
                </td>
                <td className="content">
                  {tool ? (
                    <div className="resultPreview">
                      <div className="resultRequest">
                        <span className="toolCallNameTypeface">
                          {event.name}
                        </span>
                        <span className="toolCallPayload">{event.preview}</span>
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
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty-message">
          {view.loading
            ? '正在读取轨迹…'
            : view.data?.unavailable_reason || '没有匹配的轨迹记录。'}
        </div>
      )}
    </section>
  );
}
