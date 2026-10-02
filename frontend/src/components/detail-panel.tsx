import { DetailContent } from './detail/detail-content';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { sessionStore, type AppState } from '../state/session-store';
import { type Detail } from '../lib/types';
import { eventLabel } from '../lib/event-presentation';
import { IconButton } from './primitives';
export function DetailPanel({ state }: { state: AppState }) {
  const view = state.views.trace,
    [detail, setDetail] = useState<Detail | null>(null),
    [output, setOutput] = useState<Detail | null>(null),
    [tab, setTab] = useState('概述'),
    [page, setPage] = useState(1),
    [error, setError] = useState('');
  const lastRef = useRef<string | null>(null),
    drag = useRef<{ x: number; width: number } | null>(null);
  useEffect(() => {
    if (lastRef.current !== view.selected) {
      lastRef.current = view.selected;
      setTab('概述');
      setPage(1);
      setDetail(null);
    }
  }, [view.selected]);
  useEffect(() => {
    if (!view.detailsOpen || !view.selected || !state.id) return;
    let current = true;
    setError('');
    setOutput(null);
    void sessionStore
      .api<Detail>('/api/event', {
        id: state.id,
        ref: view.selected,
        part: tab === '结果' ? 'output' : 'input',
        page,
      })
      .then(async (data) => {
        if (!current) return;
        setDetail(data);
        if (tab === '概述' && data.output_available) {
          const result = await sessionStore.api<Detail>('/api/event', {
            id: state.id!,
            ref: view.selected!,
            part: 'output',
            page: 1,
          });
          if (current) setOutput(result);
        }
      })
      .catch((e) => current && setError(String(e)));
    return () => {
      current = false;
    };
  }, [state.id, view.selected, view.detailsOpen, tab, page, view.version]);
  const tool = detail && ['tool', 'subtool'].includes(detail.event.kind),
    tabs = tool
      ? ['概述', '参数', '结果', 'Schema', '计时', '来源']
      : detail?.event.kind === 'assistant'
        ? [
            '概述',
            '预览',
            '原始内容',
            ...(detail.request_config ? ['请求配置'] : []),
            '计时',
            '来源',
          ]
        : ['概述', '预览', '原始内容', '来源'];
  const change = (tab: string) => {
    setTab(tab);
    setPage(1);
  };
  const event = detail?.event,
    [label, color] = eventLabel(event),
    loaded =
      detail &&
      detail.part === (tab === '结果' ? 'output' : 'input') &&
      detail.page === page;
  return (
    <div
      className="detail-slot"
      data-open={view.detailsOpen}
      style={{ '--detail-width': state.detailWidth + 'px' } as CSSProperties}
    >
      <aside
        className="details"
        aria-label="事件详情"
        aria-hidden={!view.detailsOpen}
        inert={!view.detailsOpen}
      >
        <div
          className="detailsResizeHandle"
          role="separator"
          tabIndex={0}
          aria-label="调整事件详情宽度"
          aria-orientation="vertical"
          aria-valuemin={280}
          aria-valuemax={800}
          aria-valuenow={state.detailWidth}
          onDoubleClick={() => sessionStore.update({ detailWidth: 400 })}
          onKeyDown={(e) => {
            if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
              e.preventDefault();
              sessionStore.update({
                detailWidth: Math.max(
                  280,
                  Math.min(
                    800,
                    state.detailWidth + (e.key === 'ArrowLeft' ? 20 : -20),
                  ),
                ),
              });
            }
          }}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, width: state.detailWidth };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current)
              sessionStore.update({
                detailWidth: Math.max(
                  280,
                  Math.min(
                    800,
                    drag.current.width + drag.current.x - e.clientX,
                  ),
                ),
              });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        />
        <div className="detailsHeader">
          <div className="detailsTitle">
            <span className={'kindTag ' + color}>{label}</span>
            <span className="detailsLocation">
              第 {event?.turn || ''} 轮 ·{' '}
              {event?.step != null
                ? `第 ${event.step} 步`
                : event?.name || view.selected || '消息'}
            </span>
          </div>
          <IconButton
            icon="close"
            label="关闭详情"
            onClick={() => sessionStore.updateView({ detailsOpen: false })}
          />
        </div>
        <nav className="detailTabs" aria-label="事件详情页签">
          {tabs.map((item) => (
            <button
              key={item}
              className={'detailTab' + (item === tab ? ' detailTabActive' : '')}
              aria-selected={item === tab}
              onClick={() => change(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="detailBody">
          {error ? (
            <p className="metadata-note" role="alert">
              {error}
            </p>
          ) : !detail || !loaded ? (
            <p className="metadata-note">
              {view.selected ? '正在读取…' : '选择一条轨迹查看详情。'}
            </p>
          ) : (
            <>
              <DetailContent
                detail={detail}
                output={output}
                tab={tab}
                id={state.id!}
                change={change}
              />
              {detail.pages > 1 &&
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
