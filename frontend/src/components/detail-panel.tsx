import { DetailContent } from './detail/detail-content';
import { useId, useState, type CSSProperties } from 'react';
import { sessionStore, type AppState } from '../state/session-store';
import { eventLabel } from '../lib/event-presentation';
import { IconButton } from './primitives';
import { RequestContent } from './detail/request-content';
import { useEventDetail } from '../hooks/use-event-detail';
import {
  useInspectorTabs,
  useSettledInspectorTabs,
} from '../hooks/use-inspector-tabs';
import { useDetailResize } from '../hooks/use-detail-resize';

export { detailTabs } from './detail/detail-tabs';
import { detailTabs } from './detail/detail-tabs';
import { recordType } from '../lib/record-presentation';

export function DetailPanel({ state }: { state: AppState }) {
  const liveView = state.views.trace;
  // Keep the last open inspector intact while its closing transition runs.
  const snapshot = {
    selected: liveView.selected,
    summaryNonce: liveView.summaryNonce,
    requestOpen: liveView.requestOpen,
    version: liveView.version,
  };
  const [retainedView, setRetainedView] = useState(snapshot);
  if (
    liveView.detailsOpen &&
    (retainedView.selected !== snapshot.selected ||
      retainedView.summaryNonce !== snapshot.summaryNonce ||
      retainedView.requestOpen !== snapshot.requestOpen ||
      retainedView.version !== snapshot.version)
  )
    setRetainedView(snapshot);
  const view = liveView.detailsOpen ? liveView : retainedView,
    { tab, page, change, setPage, settle } = useInspectorTabs(
      view.selected,
      view.summaryNonce,
    ),
    { metadata, detail, output, error, loaded } = useEventDetail(
      state.id,
      view.selected,
      liveView.detailsOpen,
      view.version,
      tab,
      page,
    ),
    resize = useDetailResize(state),
    panelId = useId();
  const tool = metadata && ['tool', 'subtool'].includes(metadata.event.kind),
    requestOpen =
      (view.requestOpen || metadata?.event.request_only) &&
      metadata?.event.request_number != null,
    tabs = requestOpen
      ? ['概述', ...(metadata?.request_config ? ['选项'] : []), '用量', '计时']
      : detailTabs(metadata),
    activeTab = tabs.includes(tab) ? tab : (tabs[0] ?? tab);
  useSettledInspectorTabs(
    view.selected,
    view.summaryNonce,
    metadata,
    Boolean(requestOpen),
    settle,
  );
  const event = metadata?.event,
    [label, color] = eventLabel(event);
  return (
    <div
      className="detail-slot"
      data-open={liveView.detailsOpen}
      style={
        state.detailWidth == null
          ? undefined
          : ({ '--detail-width': state.detailWidth + 'px' } as CSSProperties)
      }
    >
      <aside
        className="details"
        aria-label="事件详情"
        aria-hidden={!liveView.detailsOpen}
        inert={!liveView.detailsOpen}
      >
        <div
          className="detailsResizeHandle"
          role="separator"
          tabIndex={0}
          aria-label="调整事件详情宽度"
          aria-orientation="vertical"
          aria-valuemin={320}
          aria-valuemax={720}
          {...resize}
        />
        <div className="detailsHeader">
          <div className="detailsTitle">
            {requestOpen ? (
              <>
                <span className="requestDetailsDot" aria-hidden="true" />
                <span className="requestDetailsName">
                  请求 #{event?.request_number}
                </span>
                <span className="detailsLocation">
                  第 {event?.turn} 轮
                  {event && recordType(event) === 'compaction' ? ' · 压缩' : ''}
                </span>
              </>
            ) : metadata?.prompt_snapshot ? (
              <>
                <span className="kindTag systemNeutral">系统</span>
                <span className="detailsLocation">{event?.name}</span>
              </>
            ) : (
              <>
                <span className={'kindTag ' + color}>{label}</span>
                <span className="detailsLocation">
                  第 {event?.turn || ''} 轮 ·{' '}
                  {event?.step != null
                    ? `第 ${event.step} 步`
                    : event?.name || view.selected || '消息'}
                </span>
              </>
            )}
          </div>
          <IconButton
            icon="close"
            label="关闭详情"
            onClick={() => sessionStore.clearSelection()}
          />
        </div>
        <nav className="detailTabs" role="tablist" aria-label="事件详情页签">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              id={`${panelId}-tab-${item}`}
              aria-controls={`${panelId}-body`}
              className={
                'detailTab' + (item === activeTab ? ' detailTabActive' : '')
              }
              aria-selected={item === activeTab}
              onClick={() => change(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div
          key={`${view.selected}:${requestOpen}:${activeTab}:${page}`}
          className="detailBody"
          id={`${panelId}-body`}
          role="tabpanel"
          aria-labelledby={`${panelId}-tab-${activeTab}`}
          data-overview={
            activeTab === '概述' &&
            (tool ||
              requestOpen ||
              (detail &&
                recordType(detail.event) !== 'compaction' &&
                !detail.prompt_snapshot))
          }
        >
          {error && !detail ? (
            <p className="metadata-note" role="alert">
              {error}
            </p>
          ) : !detail || !loaded ? (
            <p className="metadata-note">
              {view.selected ? '正在读取…' : '选择一条轨迹查看详情。'}
            </p>
          ) : (
            <>
              {error && (
                <p className="metadata-note" role="alert">
                  {error}
                </p>
              )}
              {requestOpen ? (
                <RequestContent
                  detail={detail}
                  tab={activeTab}
                  change={change}
                />
              ) : (
                <DetailContent
                  detail={detail}
                  output={output}
                  tab={activeTab}
                  id={state.id!}
                  change={change}
                />
              )}
              {detail.pages > 1 &&
                !(detail.code_program && tab !== '结果') &&
                !detail.prompt_snapshot &&
                !requestOpen &&
                !['来源', 'Schema', '计时', '请求配置'].includes(tab) && (
                  <div className="detail-pager">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      上一页
                    </button>
                    <span>
                      {page} / {detail.pages} ·{' '}
                      {detail.total_chars.toLocaleString()} 字符
                    </span>
                    <button
                      disabled={page >= detail.pages}
                      onClick={() => setPage(page + 1)}
                    >
                      下一页
                    </button>
                  </div>
                )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
