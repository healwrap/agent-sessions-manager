import type { QuotaBenchmarks } from '../lib/account-overview';

export function sampleBenchmarks(): QuotaBenchmarks {
  return {
    source_label: '演示估算数据',
    source_url: 'https://alldonesites.com/claude-usage-tracker/',
    data_url: 'https://alldonesites.com/data/claude-usage.json',
    generated_at: new Date().toISOString(),
    observed_at: null,
    models: (
      [
        ['claude-opus-5-5', 'Opus 5.5', 'opus-5-5', 1_360_000_000],
        ['claude-opus-5', 'Opus 5', 'opus', 1_028_000_000],
        ['claude-sonnet-5', 'Sonnet 5', 'sonnet', 2_043_000_000],
        ['claude-sonnet-5-5', 'Sonnet 5.5', 'sonnet-5-5', 2_571_000_000],
        ['claude-haiku-4-5', 'Haiku 4.5', 'haiku', 5_142_000_000],
        ['claude-haiku-5-5', 'Haiku 5.5', 'haiku-5-5', 51_422_000_000],
        ['claude-opus-4-6', 'Opus 4.6', 'opus-4-6', 1_028_000_000],
        ['claude-fable-5-1', 'Fable 5.1', 'fable', 338_000_000],
      ] as const
    ).map(([id, label, family, capacity]) => ({
      id,
      label,
      family,
      as_of: null,
      rate_source:
        family === 'sonnet-5-5' ||
        family === 'haiku-5-5' ||
        family === 'opus-4-6'
          ? 'list_price_until_separable'
          : 'demo',
      conversion:
        family === 'sonnet-5-5' ||
        family === 'haiku-5-5' ||
        family === 'opus-4-6'
          ? '按 Opus 5 的混合 Token 样本与数据源发布的模型消耗比例换算（演示）'
          : undefined,
      qualification: '演示用量换算',
      mixed: { value: capacity, low: null, high: null },
      mixed_as_of: null,
      plans:
        family === 'fable'
          ? {
              pro: { included: false, weekly_fraction: 0 },
              max5: { included: true, weekly_fraction: 0.5 },
              max20: { included: true, weekly_fraction: 0.5 },
            }
          : {},
    })),
    plan_ratios: { pro: 0.05, max5: 0.25, max20: 1 },
    plan_basis: {},
    weekly_windows: {
      pro: { value: 5, inferred: true, stale: false },
      max5: { value: 7, inferred: true, stale: false },
      max20: { value: 4, inferred: false, stale: false },
    },
    cache_read_share: 0.962,
    sample_count: null,
    account_count: null,
    fetched_at: null,
    refreshing: false,
    error: '',
    stale: false,
    next_refresh_at: 0,
  };
}
