import { Payload } from './detail/payload';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { sessionStore, type AppState } from '../state/session-store';
import { kindLabels, statusLabels, type Detail } from '../lib/types';
import { IconButton } from './primitives';
import { Markdown } from './markdown';
export function DetailPanel({ state }: { state: AppState }) {
  const view = state.views.trace,
    [detail, setDetail] = useState<Detail | null>(null),
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
    void sessionStore
      .api<Detail>('/api/event', {
        id: state.id,
        ref: view.selected,
        part: tab === '结果' ? 'output' : 'input',
        page,
      })
      .then((data) => current && setDetail(data))
      .catch((e) => current && setError(String(e)));
    return () => {
      current = false;
    };
  }, [state.id, view.selected, view.detailsOpen, tab, page, view.version]);
  const tool = detail && ['tool', 'subtool'].includes(detail.event.kind),
    tabs = tool
      ? ['概述', '参数', '结果', 'Schema', '计时', '来源']
      : ['概述', '预览', '原始内容', '来源'];
  const change = (tab: string) => {
    setTab(tab);
    setPage(1);
  };
  const event = detail?.event,
    [label, color] = kindLabels[event?.kind || ''] || ['消息', 'systemNeutral'];
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
              {event?.name || view.selected || '消息'}
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
          ) : !detail ? (
            <p className="metadata-note">
              {view.selected ? '正在读取…' : '选择一条轨迹查看详情。'}
            </p>
          ) : (
            <>
              {tab === '概述' ? (
                <>
                  <dl className="overview">
                    {[
                      ['来源', detail.provider_label],
                      ['状态', statusLabels[event!.status] || event!.status],
                      ['引用', event!.ref],
                      [
                        '时长',
                        event!.duration_ms === null
                          ? '未记录'
                          : (event!.duration_ms / 1000).toFixed(2) + ' 秒',
                      ],
                    ].map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd title={value}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="detail-content">
                    <button
                      className="section-title"
                      onClick={() => change(tool ? '参数' : '预览')}
                    >
                      {tool ? '参数' : '预览'} ›
                    </button>
                    {tool ? (
                      <Payload text={detail.text} />
                    ) : (
                      <Markdown text={detail.text} />
                    )}{' '}
                    {tool && (
                      <>
                        <button
                          className="section-title detail-section"
                          onClick={() => change('结果')}
                        >
                          结果 ›
                        </button>
                        <p className="metadata-note">
                          {detail.output_available
                            ? '点击查看本次调用的结果。'
                            : event!.result_note ||
                              '此调用没有独立关联的结果。'}
                        </p>
                      </>
                    )}
                    {detail.nested?.map((item) => (
                      <button
                        key={item.ref}
                        className="nested-link"
                        onClick={() =>
                          void sessionStore.selectEvent(item.ref, true)
                        }
                      >
                        {item.name} · {item.ref} ›
                      </button>
                    ))}
                  </div>
                </>
              ) : tab === '来源' ? (
                <div className="detail-content">
                  <pre>
                    {detail.source}
                    {'\n'}第 {detail.line} 行{'\n'}
                    {detail.thread_id}
                  </pre>
                </div>
              ) : tab === '计时' ? (
                <div className="detail-content">
                  <pre>
                    {event!.timestamp || '未记录时间'}
                    {'\n'}
                    {event!.duration_ms !== null
                      ? event!.duration_ms + ' 毫秒'
                      : '未记录执行时长'}
                  </pre>
                </div>
              ) : tab === 'Schema' ? (
                <div className="detail-content">
                  <p>原始记录未保存工具 Schema。</p>
                </div>
              ) : (
                <div className="detail-content">
                  {tab === '结果' && !detail.output_available ? (
                    <>
                      <p>
                        {event!.result_note || '原始记录中没有独立关联的结果。'}
                      </p>
                      {detail.parent_ref && (
                        <button
                          className="nested-link"
                          onClick={() =>
                            void sessionStore.selectEvent(
                              detail.parent_ref!,
                              true,
                            )
                          }
                        >
                          查看组合调用结果 ›
                        </button>
                      )}
                    </>
                  ) : tab === '预览' ? (
                    <Markdown text={detail.text} />
                  ) : (
                    <Payload
                      text={detail.text}
                      raw={tab === '原始内容' || tab === '结果'}
                    />
                  )}
                </div>
              )}
              {detail.pages > 1 &&
                !['来源', 'Schema', '计时'].includes(tab) && (
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
