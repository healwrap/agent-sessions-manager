import type { Detail } from '../../lib/types';
import { recordType } from '../../lib/record-presentation';

export function detailTabs(detail: Detail | null): string[] {
  if (!detail) return ['概述'];
  if (detail.prompt_snapshot)
    return [
      ...(detail.previous_prompt_snapshot ? ['差异'] : []),
      '系统提示词',
      ...(detail.prompt_snapshot.tools === null ? [] : ['工具']),
    ];
  const event = detail.event;
  if (['tool', 'subtool'].includes(event.kind))
    return [
      '概述',
      ...(detail.code_program ? ['源码'] : detail.text ? ['参数'] : []),
      ...(detail.output_available ||
      detail.code_program ||
      event.result_note ||
      detail.parent_ref
        ? ['结果']
        : []),
      'Schema',
      '计时',
    ];
  if (recordType(event) === 'compaction') return ['概述', '原始内容'];
  return [
    '概述',
    '预览',
    '原始内容',
    ...(event.request_number == null && detail.request_config
      ? ['请求配置']
      : []),
    ...(event.kind === 'assistant' &&
    event.request_number == null &&
    (event.timestamp || event.duration_ms != null)
      ? ['计时']
      : []),
    ...(event.kind === 'assistant' && event.request_number != null
      ? []
      : ['来源']),
  ];
}
