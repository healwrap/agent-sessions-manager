import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ProxyConfig } from '../lib/environment-settings';
import { fallbackChain } from '../lib/network-fallback';
import { Button, Field, Select } from './ui';

export function NetworkFallbackFields({
  id,
  name,
  lines,
  selected,
  mode,
  disabled,
  onChange,
  onMode,
}: {
  id?: string;
  name: string;
  lines: ProxyConfig[];
  selected: string[];
  mode: 'manual' | 'automatic';
  disabled: boolean;
  onChange: (ids: string[]) => void;
  onMode: (mode: 'manual' | 'automatic') => void;
}) {
  const available = lines.filter(
    (row) =>
      row.id !== id &&
      !selected.includes(row.id) &&
      !fallbackChain(lines, row.id).some((node) => node.id === id),
  );
  const move = (index: number, offset: number) => {
    const next = [...selected];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };
  const preview = fallbackChain(
    [
      ...lines.filter((row) => row.id !== id),
      {
        id: id || 'new-node',
        name: name || '主节点',
        fallback_ids: selected,
      } as ProxyConfig,
    ],
    id || 'new-node',
  );
  return (
    <div className="network-fallback-fields">
      <Field label="备用节点（按顺序尝试）">
        {selected.map((key, index) => (
          <div className="network-fallback-order" key={key}>
            <span>
              {index + 1}.{' '}
              {lines.find((row) => row.id === key)?.name || '节点已移除'}
            </span>
            <Button
              disabled={disabled || index === 0}
              aria-label={'上移备用节点 ' + (index + 1)}
              onClick={() => move(index, -1)}
            >
              <ArrowUp size={15} />
            </Button>
            <Button
              disabled={disabled || index === selected.length - 1}
              aria-label={'下移备用节点 ' + (index + 1)}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={15} />
            </Button>
            <Button
              disabled={disabled}
              aria-label={'移除备用节点 ' + (index + 1)}
              onClick={() =>
                onChange(selected.filter((value) => value !== key))
              }
            >
              <Trash2 size={15} />
            </Button>
          </div>
        ))}
        {available.length > 0 && selected.length < 8 && (
          <Select
            label="添加备用节点"
            disabled={disabled}
            value=""
            onChange={(key) => key && onChange([...selected, key])}
            options={[
              { value: '', label: '选择一个已有节点' },
              ...available.map((row) => ({ value: row.id, label: row.name })),
            ]}
          />
        )}
        {!lines.length && (
          <p className="network-bound-accounts">
            <Plus size={14} /> 先添加其他节点，再将它选作备用。
          </p>
        )}
      </Field>
      {selected.length > 0 && (
        <>
          <p className="network-bound-accounts">
            回退顺序：{preview.map((row) => row.name).join(' → ')}
          </p>
          <Field label="运行中发生故障时">
            <Select
              label="故障处理方式"
              disabled={disabled}
              value={mode}
              onChange={(value) => onMode(value as typeof mode)}
              options={[
                { value: 'manual', label: '提醒我，由我切换' },
                { value: 'automatic', label: '连续失败后自动回退' },
              ]}
            />
          </Field>
          <p className="network-bound-accounts">
            启动时会依次检查。自动模式每 20 秒检测，连续 3
            次失败后重启环境并切换，登录和会话保留。切换后不会自动回到主节点。
          </p>
        </>
      )}
    </div>
  );
}
