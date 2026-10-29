import type { QuotaBenchmarks } from '../lib/account-overview';

export function sampleBenchmarks(): QuotaBenchmarks {
  return {
    source_label: '演示估算数据',
    source_url: 'https://alldonesites.com/claude-usage-tracker/',
    data_url: 'https://alldonesites.com/data/claude-usage.json',
    generated_at: new Date().toISOString(),
    observed_at: null,
    models: [
      {
        id: 'claude-opus-5-5',
        label: 'Opus 5.5',
        family: 'opus-5-5',
        as_of: null,
        rate_source: 'demo',
        qualification: '演示用量换算',
        input: { value: 80_000_000, low: null, high: null },
        output: { value: 16_000_000, low: null, high: null },
        mixed: null,
        mixed_as_of: null,
        plans: {},
      },
    ],
    plan_ratios: { pro: 0.05, max5: 0.3, max20: 1 },
    plan_basis: {},
    weekly_windows: {
      pro: { value: 5, inferred: true, stale: false },
      max5: { value: 7, inferred: true, stale: false },
      max20: { value: 4, inferred: false, stale: false },
    },
    cache_read_share: null,
    sample_count: null,
    account_count: null,
    proxy_id: '',
    fetched_at: null,
    refreshing: false,
    error: '',
    stale: false,
    next_refresh_at: 0,
  };
}
