import { useEffect, useRef, useState } from 'react';
import type { Detail } from '../lib/types';
import { detailTabs } from '../components/detail/detail-tabs';

export function useInspectorTabs(
  selection: string | null,
  summaryNonce: number,
) {
  const history = useRef(new Set<string>());
  const [choice, setChoice] = useState({
    selection,
    summaryNonce,
    tab: '概述',
    page: 1,
  });
  const same =
    choice.selection === selection && choice.summaryNonce === summaryNonce;
  const tab = same ? choice.tab : '概述',
    page = same ? choice.page : 1;
  const change = (tab: string) => {
    history.current.delete(tab);
    history.current.add(tab);
    setChoice({ selection, summaryNonce, tab, page: 1 });
  };
  const settle = (detail: Detail | null, request: boolean) => {
    if (!detail || same) return;
    const tabs = request
      ? ['概述', '选项', '用量', '计时']
      : detailTabs(detail);
    const forced = request || choice.summaryNonce !== summaryNonce;
    const recent = [...history.current]
      .reverse()
      .find((tab) => tabs.includes(tab));
    const next = forced ? '概述' : (recent ?? tabs[0] ?? '概述');
    if (forced) {
      history.current.delete(next);
      history.current.add(next);
    }
    setChoice({ selection, summaryNonce, tab: next, page: 1 });
  };
  return {
    tab,
    page,
    change,
    settle,
    setPage: (page: number) =>
      setChoice({ selection, summaryNonce, tab, page }),
  };
}

export function useSettledInspectorTabs(
  selection: string | null,
  summaryNonce: number,
  detail: Detail | null,
  request: boolean,
  settle: (detail: Detail | null, request: boolean) => void,
) {
  useEffect(() => {
    settle(detail, request);
  }, [selection, summaryNonce, detail, request, settle]);
}
