import { DetailContent } from './detail/detail-content';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { sessionStore, type AppState } from '../state/session-store';
import { type Detail } from '../lib/types';
import { eventLabel } from '../lib/event-presentation';
import { IconButton } from './primitives';
import { RequestContent } from './detail/request-content';

export function detailTabs(detail: Detail | null): string[] {
  const tool = detail && ['tool', 'subtool'].includes(detail.event.kind);
  const dsh = detail?.provider_label === 'DeepSeek Harness';
  if (dsh && detail?.prompt_snapshot) {
    const tabs = [
      ...(detail.previous_prompt_snapshot ? ['差异'] : []),
      '系统提示词',
      ...(detail.prompt_snapshot.tools === null ? [] : ['工具']),
    ];
    return tabs;
  }
  if (tool)
    return dsh
      ? [
          '概述',
          ...(detail.text ? ['参数'] : []),
          ...(detail.output_available ? ['结果'] : []),
          'Schema',
          '计时',
        ]
      : ['概述', '参数', '结果', 'Schema', '计时', '来源'];
  if (dsh && detail?.event.name === '上下文压缩') return ['概述', '原始内容'];
  if (dsh && detail?.event.kind === 'assistant')
    return ['概述', '预览', '原始内容'];
  if (dsh)
    return [
      '概述',
      '预览',
      '原始内容',
      ...(detail?.message_source === undefined ? [] : ['来源']),
    ];
  return detail?.event.kind === 'assistant'
    ? [
        '概述',
        '预览',
        '原始内容',
        ...(detail.request_config ? ['请求配置'] : []),
        '计时',
        '来源',
      ]
    : ['概述', '预览', '原始内容', '来源'];
}

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
    const part =
      tab === '结果'
        ? 'output'
        : tab === '原始内容' && view.data?.provider_label === 'DeepSeek Harness'
          ? 'raw'
          : 'input';
    setError('');
    setOutput(null);
    void sessionStore
      .api<Detail>('/api/event', {
        id: state.id,
        ref: view.selected,
        part,
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
  }, [
    state.id,
    view.selected,
    view.detailsOpen,
    tab,
    page,
    view.version,
    view.data?.provider_label,
  ]);
  const tool = detail && ['tool', 'subtool'].includes(detail.event.kind),
    requestOpen = view.requestOpen && detail?.event.request_number != null,
    tabs = requestOpen
      ? ['概述', ...(detail?.request_config ? ['选项'] : []), '用量', '计时']
      : detailTabs(detail),
    activeTab = tabs.includes(tab) ? tab : (tabs[0] ?? tab);
  const change = (tab: string) => {
    setTab(tab);
    setPage(1);
  };
  const event = detail?.event,
    [label, color] = eventLabel(event),
    loadedPart =
      tab === '结果'
        ? 'output'
        : tab === '原始内容' && view.data?.provider_label === 'DeepSeek Harness'
          ? 'raw'
          : 'input',
    loaded = detail && detail.part === loadedPart && detail.page === page;
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
            {requestOpen ? (
              <span className="detailsLocation">
                请求 #{event?.request_number}
                {event?.name === '上下文压缩' ? ' · 压缩' : ''}
              </span>
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
            onClick={() => sessionStore.updateView({ detailsOpen: false })}
          />
        </div>
        <nav className="detailTabs" aria-label="事件详情页签">
          {tabs.map((item) => (
            <button
              key={item}
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
          data-overview={
            activeTab === '概述' &&
            (tool ||
              requestOpen ||
              (detail?.provider_label === 'DeepSeek Harness' &&
                event?.name !== '上下文压缩' &&
                !detail.prompt_snapshot))
          }
        >
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
