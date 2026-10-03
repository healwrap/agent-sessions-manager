import { useMemo } from 'react';
import { JsonTree } from '../json-tree/json-tree';
import type { JsonTreeLabels } from '../json-tree/types';
import { stringWrapping } from '../../lib/string-wrapping';

const labels: JsonTreeLabels = {
  copyValue: '复制值',
  copyJson: '复制 JSON',
  copyPath: '复制属性路径',
  copyPrettyJson: '复制格式化 JSON',
  copyCompactJson: '复制紧凑 JSON',
  copied: '已复制',
  copyFailed: '复制失败',
  collapseNode: '收起',
  expandNode: '展开',
  copyButtonTitle: (action) => `${action}（右键查看更多复制选项）`,
};

export function Payload({
  text,
  raw = false,
  preview = false,
  label = 'JSON',
  className,
}: {
  text: string;
  raw?: boolean;
  preview?: boolean;
  label?: string;
  className?: string;
}) {
  const parsed = useMemo(() => {
    if (raw) return;
    try {
      const value: unknown = JSON.parse(text);
      if (value !== null && typeof value === 'object') return value;
    } catch {}
  }, [text, raw]);
  return parsed === undefined ? (
    <pre>{text}</pre>
  ) : (
    <JsonTree
      data={parsed}
      label={label}
      labels={labels}
      className={className}
      collapsedStringLines={preview ? 3 : 12}
      stringWrapping={stringWrapping}
    />
  );
}
