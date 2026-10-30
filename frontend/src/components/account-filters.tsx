import { X } from 'lucide-react';
import {
  accountStates,
  defaultAccountFilters,
  type AccountFilterValue,
  type AccountStateKind,
} from '../lib/account-state';
import { Button, ChoiceGroup, CollectionToolbar, Select } from './ui';

export function AccountFilters({
  value,
  counts,
  onChange,
}: {
  value: AccountFilterValue;
  counts: Record<'all' | AccountStateKind, number>;
  onChange: (value: AccountFilterValue) => void;
}) {
  const active = Object.keys(defaultAccountFilters).some(
    (key) =>
      value[key as keyof AccountFilterValue] !==
      defaultAccountFilters[key as keyof AccountFilterValue],
  );
  return (
    <div className="account-filters">
      <ChoiceGroup
        className="account-state-tabs"
        label="筛选账号可用状态"
        variant="tabs"
        value={value.state}
        onChange={(state) => onChange({ ...value, state })}
        items={[
          { value: 'all', label: '全部', count: counts.all },
          ...Object.entries(accountStates).map(([kind, state]) => ({
            value: kind as AccountStateKind,
            label: state.label,
            count: counts[kind as AccountStateKind],
          })),
        ]}
      />
      <CollectionToolbar
        query={value.query}
        onQuery={(query) => onChange({ ...value, query })}
        searchLabel="搜索账号"
        placeholder="搜索邮箱或代理"
      >
        <Select
          label="筛选账号平台"
          value={value.provider}
          onChange={(provider) =>
            onChange({
              ...value,
              provider,
              plan: provider === 'codex' ? 'all' : value.plan,
            })
          }
          options={[
            { value: 'all', label: '全部平台' },
            { value: 'claude', label: 'Claude' },
            { value: 'codex', label: 'Codex' },
          ]}
        />
        <Select
          label="筛选订阅套餐"
          value={value.plan}
          disabled={value.provider === 'codex'}
          onChange={(plan) => onChange({ ...value, plan })}
          options={[
            { value: 'all', label: '全部套餐' },
            { value: 'pro', label: 'Pro' },
            { value: 'max5', label: 'Max 5x' },
            { value: 'max20', label: 'Max 20x' },
            { value: 'unknown', label: '套餐待确认' },
          ]}
        />
        <Select
          label="筛选环境运行情况"
          value={value.runtime}
          onChange={(runtime) => onChange({ ...value, runtime })}
          options={[
            { value: 'all', label: '全部环境状态' },
            { value: 'running', label: '有环境运行' },
            { value: 'stopped', label: '无环境运行' },
            { value: 'checking', label: '启动检查中' },
            { value: 'issues', label: '有环境异常' },
          ]}
        />
        {active && (
          <Button
            variant="text"
            size="small"
            onClick={() => onChange(defaultAccountFilters)}
          >
            <X size={13} />
            清除筛选
          </Button>
        )}
      </CollectionToolbar>
    </div>
  );
}
