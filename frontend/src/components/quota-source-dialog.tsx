import { ExternalLink, RefreshCw } from 'lucide-react';
import type { AccountUsages } from '../hooks/use-account-usages';
import {
  planLabels,
  tokenCapacity,
  tokens,
  type BenchmarkModel,
  type Plan,
} from '../lib/account-overview';
import {
  Button,
  ContentDialog,
  Disclosure,
  FactsGrid,
  Notice,
  StatusBadge,
} from './ui';

export function QuotaSourceDialog({
  usage,
  model,
  onClose,
}: {
  usage: AccountUsages;
  model?: BenchmarkModel;
  onClose: () => void;
}) {
  const source = usage.benchmarks;
  return (
    <ContentDialog
      title="额度估算依据"
      onClose={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      {source ? (
        <>
          <FactsGrid
            items={[
              {
                label: '社区 Token 数据',
                value: (
                  <a href={source.source_url} target="_blank" rel="noreferrer">
                    {source.source_label} <ExternalLink size={13} />
                  </a>
                ),
              },
              {
                label: '套餐倍数依据',
                value: source.plan_basis.source_url ? (
                  <a
                    href={source.plan_basis.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.plan_basis.source_label || '套餐比例来源'}{' '}
                    <ExternalLink size={13} />
                  </a>
                ) : (
                  '演示比例'
                ),
              },
              {
                label: '发布时间',
                value: new Date(source.generated_at).toLocaleString('zh-CN'),
              },
              { label: '模型', value: model?.label || '未选择' },
              { label: '换算口径', value: '混合 Token（含缓存）' },
              { label: '实时余额依据', value: 'Claude 账号用量读数' },
            ]}
          />
          <p className="quota-source-description">
            按所选模型的混合 Token
            容量，乘以各账号的实际剩余比例，再汇总为可用估算。
          </p>
          {model?.conversion && (
            <Notice>
              {model.label}：{model.conversion}。
              {model.rate_source === 'list_price_until_separable'
                ? '模型消耗比例暂按价格比例近似。'
                : '模型消耗比例采用数据源公布的结果。'}
            </Notice>
          )}
          <div className="quota-source-table-wrap">
            <table className="quota-source-table">
              <caption>
                {model?.label} · 混合 Token（含缓存） · 满额估算
              </caption>
              <thead>
                <tr>
                  <th>套餐</th>
                  <th>每 5 小时</th>
                  <th>每周</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(planLabels) as Plan[]).map((plan) => {
                  const excluded = model?.plans[plan]?.included === false;
                  const five = model && tokenCapacity(source, model, plan);
                  const week =
                    model && tokenCapacity(source, model, plan, true);
                  return (
                    <tr key={plan}>
                      <th>{planLabels[plan]}</th>
                      <td>
                        {five
                          ? `≈ ${tokens(five.value)}`
                          : excluded
                            ? '套餐未包含'
                            : '无可用估算'}
                        {five?.low !== null && five?.high !== null && five && (
                          <small>
                            {tokens(five.low!)}–{tokens(five.high!)} Token
                          </small>
                        )}
                      </td>
                      <td>
                        {week
                          ? `≈ ${tokens(week.value)}`
                          : excluded
                            ? '套餐未包含'
                            : '无可用估算'}
                        {week && (
                          <small>
                            {source.weekly_windows[plan].inferred
                              ? '社区周容量推算'
                              : '社区周窗口测量'}
                          </small>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <FactsGrid
            items={[
              {
                label: '样本账号',
                value:
                  source.account_count === null
                    ? '未提供'
                    : `${source.account_count} 个 Max 20x 账号`,
              },
              {
                label: '模型样本日期',
                value: model?.mixed_as_of
                  ? new Date(model.mixed_as_of).toLocaleDateString('zh-CN')
                  : '未提供',
              },
            ]}
          />
          <Disclosure title="如何理解这个估算" compact>
            <p>
              5 小时套餐倍数采用 Claude 官方说明：Pro 为基准，Max 5x 为 5
              倍，Max 20x 为 20 倍。 核对日期为{' '}
              {source.plan_basis.as_of || '未提供'}。Token
              容量与周容量采用社区样本估算。
            </p>
            <p>
              混合 Token 汇总输入、输出和缓存
              Token，包含重复的缓存读取；样本缓存占比约{' '}
              {source.cache_read_share === null
                ? '未知'
                : `${(source.cache_read_share * 100).toFixed(1)}%`}
              。
            </p>
            <p>
              账号总览只汇总近期查询成功且已知套餐的额度，重复登录的同一账号与组织只计算一次。套餐或模型数据缺失时显示待确认，未取得数据的账号不补为
              0。
            </p>
            <p>
              “额度可用”表示最新读数中的 5
              小时、周额度和已返回的模型额度均未用尽。登录失效、访问拒绝和代理故障归为待确认，只有明确的服务停用结果计入已停用。
            </p>
            <p>
              账号状态独立显示。“可访问”表示当前身份接口可访问；服务明确返回的账号封禁／停用和组织停用分别记录。超过
              5 分钟的可访问结果归为待确认，详情保留检测时间。
            </p>
            <p>
              模型换算的依据：
              {model?.rate_source === 'measured'
                ? '第三方测得的模型消耗比例。'
                : model?.rate_source === 'reference'
                  ? '来源采用的参考锚点。'
                  : '第三方采用模型价格比例近似，尚未独立分离出该模型的消耗系数。'}
            </p>
            <a href={source.data_url} target="_blank" rel="noreferrer">
              查看原始估算数据
            </a>
          </Disclosure>
          <div className="quota-source-sync">
            <StatusBadge
              tone={source.error || source.stale ? 'warning' : 'success'}
            >
              {source.refreshing
                ? '同步中'
                : source.fetched_at
                  ? source.stale
                    ? '上次同步数据'
                    : '已同步'
                  : '内置数据快照'}
            </StatusBadge>
            <Button
              disabled={
                source.refreshing ||
                (!!source.fetched_at &&
                  usage.now / 1000 - source.fetched_at < 60)
              }
              onClick={() => void usage.refreshBenchmarks()}
            >
              <RefreshCw
                size={15}
                className={source.refreshing ? 'ui-spin' : ''}
              />
              同步最新数据
            </Button>
          </div>
          {source.error && <Notice tone="warning">{source.error}</Notice>}
          <p className="quota-source-description">
            每 6 小时通过系统网络自动更新公共数据。
          </p>
        </>
      ) : (
        <Notice>正在读取估算数据源</Notice>
      )}
    </ContentDialog>
  );
}
