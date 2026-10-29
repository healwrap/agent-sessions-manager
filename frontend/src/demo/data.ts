import type {
  BrowserAccount,
  BrowserRun,
  EnvironmentSettings,
} from '../lib/environment-settings';
import type { AccountUsage } from '../lib/account-usage';
import type { ClaudeReport } from '../lib/claude-diagnostics';

export const sampleSubscription = 'https://subscription.example.com/demo';
export const sampleSource =
  'proxies:\n  - name: 示例东京节点\n    type: socks5\n    server: proxy.example.com\n    port: 1080\n';

export function createDemoSettings(): EnvironmentSettings {
  const data: EnvironmentSettings = {
    accounts: [],
    profiles: [],
    app_profiles: [],
    proxies: [
      {
        id: 'demo-proxy-1',
        name: '示例代理 · 东京',
        url: 'http://127.0.0.1:18901',
        kind: 'managed',
      },
      {
        id: 'demo-proxy-2',
        name: '示例代理 · 洛杉矶',
        url: 'http://127.0.0.1:18902',
        kind: 'managed',
      },
    ],
    apps: [
      { id: 'claude', name: 'Claude App（示例）', path: '/demo/Claude.app' },
    ],
    gate_definitions: [
      {
        id: 'proxy',
        title: '代理连接',
        description: '启动前检查代理是否可用',
        default_mode: 'block',
      },
      {
        id: 'exit_ip',
        title: '出口 IP',
        description: '比对环境的预期出口',
        default_mode: 'block',
      },
    ],
    browser: {
      kernel: {
        available: true,
        name: 'Chromium（示例）',
        version: '演示版本',
        path: '/demo/browser',
        source: 'demo',
      },
      runs: [],
      sessions: {},
    },
    app_runtime: { runs: [], sessions: {} },
    proxy_runtime: {
      core: {
        available: true,
        version: '演示版本',
        installation: { state: 'ready', progress: 100, error: '', message: '' },
      },
      entries: [],
      adoptable: [],
    },
  };
  for (const [index, name] of [
    'alice@example.com',
    'bob@example.com',
  ].entries()) {
    const id = 'demo-account-' + (index + 1);
    const route = {
      proxy_id: data.proxies[index].id,
      locale: index ? 'en-US' : 'ja-JP',
      timezone: index ? 'America/Los_Angeles' : 'Asia/Tokyo',
      locale_mode: 'proxy' as const,
      timezone_mode: 'proxy' as const,
    };
    data.accounts.push({
      id,
      name,
      provider: 'claude',
      profile_id: id + '-browser',
      app_profile_id: id + '-app',
    });
    data.profiles.push({
      ...route,
      id: id + '-browser',
      name: name + ' · 浏览器',
      provider: 'claude',
      engine: 'fingerprint-chromium',
      fingerprint_seed: 'demo-seed-' + index,
      name_account_id: id,
    });
    data.app_profiles.push({
      ...route,
      id: id + '-app',
      name: name + ' · Claude App',
      name_account_id: id,
    });
    data.browser.sessions![id + '-browser'] = {
      state: 'saved',
      label: '示例登录状态',
    };
    data.app_runtime.sessions[id + '-app'] = {
      state: 'saved',
      label: '示例登录状态',
    };
  }
  data.proxy_runtime!.entries = data.proxies.map((proxy) => ({
    id: proxy.id,
    alive: true,
    status: 'running',
    error: '',
    node: { name: proxy.name, type: 'socks5' },
    direct_domains: [],
    subscription: {
      url: sampleSubscription,
      node_name: proxy.name,
      interval_hours: 6,
      status: 'current',
      last_updated: Date.now() / 1000,
    },
  }));
  return data;
}

export function sampleRun(
  account: BrowserAccount,
  target: 'browser' | 'app',
): BrowserRun {
  return {
    profile_id: (target === 'browser'
      ? account.profile_id
      : account.app_profile_id)!,
    account_id: account.id,
    name: account.name,
    status: 'running',
    alive: true,
    stage: '示例环境已打开',
    checked_at: new Date().toISOString(),
    checks: [
      {
        id: 'proxy',
        title: '代理连接',
        policy: 'block',
        state: 'pass',
        value: '示例代理可用',
        detail: '模拟结果',
      },
      {
        id: 'exit_ip',
        title: '出口 IP',
        policy: 'block',
        state: 'pass',
        value: '203.0.113.42',
        detail: '演示地址',
      },
    ],
    resolved: {
      ip: '203.0.113.42',
      country: 'JP',
      locale: 'ja-JP',
      timezone: 'Asia/Tokyo',
    },
    browser_checks: [],
    error: '',
  };
}

export function sampleUsage(
  account: BrowserAccount,
  loggedIn: boolean,
): AccountUsage {
  return {
    account_id: account.id,
    plan: account.usage_plan || 'pro',
    health: {
      state: loggedIn ? 'accessible' : 'unknown',
      checked_at: Date.now() / 1000,
      message: '演示账号状态',
    },
    status: loggedIn ? 'ready' : 'login_required',
    refreshing: false,
    can_refresh: true,
    stale: false,
    updated_at: loggedIn ? Date.now() / 1000 : null,
    next_refresh_at: 0,
    error: loggedIn ? '' : '演示环境已打开，可在引导中体验模拟登录。',
    source_label: '演示数据',
    organization_id: 'demo-org',
    organization_name: '示例工作空间',
    organizations: [{ id: 'demo-org', name: '示例工作空间' }],
    windows: loggedIn
      ? [
          {
            id: 'five_hour',
            label: '5 小时用量',
            used_percent: 24,
            resets_at: new Date(Date.now() + 7200_000).toISOString(),
          },
          {
            id: 'seven_day',
            label: '7 天用量',
            used_percent: 58,
            resets_at: new Date(Date.now() + 3 * 86400_000).toISOString(),
          },
        ]
      : [],
    extra_usage: null,
  };
}

export function sampleReport(proxy: string): ClaudeReport {
  const checked_at = new Date().toISOString();
  const route = { mode: 'proxy' as const, label: '示例代理', endpoint: proxy };
  return {
    checked_at,
    route,
    exits: {
      claude: { ip: '203.0.113.42', country: 'JP', colo: 'NRT', ms: 128 },
      cloudflare: { ip: '203.0.113.42', country: 'JP', colo: 'NRT', ms: 132 },
    },
    ip_details: {
      country: 'JP',
      city: '东京',
      timezone: 'Asia/Tokyo',
      org: '示例网络',
    },
    ip_reputation: {
      provider: '演示数据',
      ip: '203.0.113.42',
      state: 'ok',
      queried_at: checked_at,
      cached: false,
      network_type: 'Residential',
      trust_score: 90,
    },
    checks: [
      {
        id: 'claude-trace',
        title: 'Claude 域名出口',
        state: 'pass',
        value: '203.0.113.42',
        detail: '模拟结果',
        scope: '演示模式',
      },
    ],
    local_checks: [],
    history: [
      {
        checked_at,
        route,
        claude_ip: '203.0.113.42',
        cloudflare_ip: '203.0.113.42',
        country: 'JP',
        org: '示例网络',
      },
    ],
  };
}
