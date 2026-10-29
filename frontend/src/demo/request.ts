import type { Request } from '../lib/types';
import type {
  BrowserAccount,
  EnvironmentCollection,
  EnvironmentItem,
} from '../lib/environment-settings';
import { initialState } from '../state/model';
import { sampleBenchmarks } from './usage';
import { demoAuthorize } from './usage-authorization';
import {
  createDemoSettings,
  sampleReport,
  sampleRun,
  sampleSource,
  sampleSubscription,
  sampleUsage,
} from './data';

const data = createDemoSettings();
const local = initialState();
let serial = 2;
const query = new URLSearchParams(location.search);
if (query.get('topic') === 'switch') {
  const target = query.get('target') === 'app' ? 'app' : 'browser';
  (target === 'browser' ? data.browser : data.app_runtime).runs.push(
    sampleRun(data.accounts[0], target),
  );
}
const wait = () => new Promise((resolve) => setTimeout(resolve, 180));
const id = (prefix: string) => `demo-${prefix}-${++serial}`;

function saveAccount(
  item: BrowserAccount,
  route: { proxy_id: string; proxy_url?: string },
) {
  const account = { ...item, id: item.id || id('account') };
  let proxy_id = route.proxy_id;
  if (route.proxy_url) {
    proxy_id = id('proxy');
    data.proxies.push({
      id: proxy_id,
      name: '示例专用代理',
      url: route.proxy_url,
    });
  }
  const base = {
    proxy_id,
    locale: 'ja-JP',
    timezone: 'Asia/Tokyo',
    locale_mode: 'proxy' as const,
    timezone_mode: 'proxy' as const,
    name_account_id: account.id,
  };
  if (item.profile_id === '__new__') {
    account.profile_id = id('browser');
    data.profiles.push({
      ...base,
      id: account.profile_id,
      name: account.name + ' · 浏览器',
      provider: account.provider,
      engine: 'fingerprint-chromium',
      fingerprint_seed: id('seed'),
    });
    data.browser.sessions![account.profile_id] = { state: 'empty', label: '' };
  }
  if (item.app_profile_id === '__new__') {
    account.app_profile_id = id('app');
    data.app_profiles.push({
      ...base,
      id: account.app_profile_id,
      name: account.name + ' · Claude App',
    });
    data.app_runtime.sessions[account.app_profile_id] = {
      state: 'empty',
      label: '',
    };
  }
  data.accounts = [
    ...data.accounts.filter((row) => row.id !== account.id),
    account,
  ];
  return data;
}

function environments(body?: unknown) {
  if (!body) return data;
  const value = body as {
    action: string;
    collection: EnvironmentCollection;
    id?: string;
    item: EnvironmentItem;
    route: { proxy_id: string };
  };
  if (value.collection === 'accounts' && value.action === 'provision')
    return saveAccount(value.item as BrowserAccount, value.route);
  const collection = value.collection;
  if (!['accounts', 'profiles', 'app_profiles', 'proxies'].includes(collection))
    throw new Error('演示集合不存在');
  const rows = data[collection] as EnvironmentItem[];
  if (value.action === 'delete') {
    const index = rows.findIndex((row) => row.id === value.id);
    if (index >= 0) rows.splice(index, 1);
  } else {
    const item = { ...value.item, id: value.item.id || id(collection) };
    const index = rows.findIndex((row) => row.id === item.id);
    if (index >= 0) rows[index] = item;
    else rows.push(item);
  }
  return data;
}

function runtime(
  path: string,
  body: { account_id?: string; profile_id?: string },
) {
  const target = path.startsWith('/api/app-runtime/') ? 'app' : 'browser';
  const state = target === 'browser' ? data.browser : data.app_runtime;
  const key = target === 'browser' ? 'profile_id' : 'app_profile_id';
  const account = data.accounts.find((row) =>
    body.account_id ? row.id === body.account_id : row[key] === body.profile_id,
  );
  const profileId = body.profile_id || account?.[key];
  if (path.endsWith('/stop')) {
    const run = state.runs.find((row) => row.profile_id === profileId);
    if (run)
      Object.assign(run, {
        alive: false,
        status: 'stopped',
        stage: '示例环境已停止',
      });
    return state;
  }
  if (!account) throw new Error('请先为示例环境绑定账号');
  const run = sampleRun(account, target);
  const profiles = target === 'browser' ? data.profiles : data.app_profiles;
  const profile = profiles.find((row) => row.id === profileId);
  const proxy = data.proxies.find((row) => row.id === profile?.proxy_id);
  if (profile?.proxy_id && !proxy) {
    Object.assign(run, {
      status: 'blocked',
      alive: false,
      error: '示例代理已移除，请重新选择代理。',
    });
    run.checks[0].state = 'fail';
  } else {
    run.status = 'checking';
    run.alive = false;
    run.stage = '模拟检查代理与环境…';
    setTimeout(() => {
      if (run.status === 'checking')
        Object.assign(run, {
          status: 'running',
          alive: true,
          stage: '示例环境已打开',
        });
    }, 900);
  }
  state.runs = [
    ...state.runs.filter((row) => row.profile_id !== run.profile_id),
    run,
  ];
  return state;
}

function proxies(path: string, body: Record<string, unknown>) {
  if (path.endsWith('/config')) return { source: sampleSource };
  if (path.endsWith('/parse'))
    return {
      token: 'demo-import',
      source: sampleSource,
      subscription_url: sampleSubscription,
      nodes: [
        {
          index: 0,
          name: '示例东京节点',
          type: 'socks5',
          server: 'proxy.example.com',
        },
        {
          index: 1,
          name: '示例洛杉矶节点',
          type: 'socks5',
          server: 'proxy.example.net',
        },
      ],
    };
  if (path.endsWith('/save')) {
    const key = String(body.id || id('proxy'));
    const entry = data.proxies.find((row) => row.id === key);
    if (entry) entry.name = String(body.name);
    else {
      data.proxies.push({
        id: key,
        name: String(body.name),
        url: 'http://127.0.0.1:' + (18900 + serial),
        kind: 'managed',
      });
      data.proxy_runtime!.entries.push({
        id: key,
        alive: true,
        status: 'running',
        error: '',
        node: {
          name: body.index === 1 ? '示例洛杉矶节点' : '示例东京节点',
          type: 'socks5',
        },
        direct_domains: body.direct_domains as string[],
        subscription: {
          url: sampleSubscription,
          node_name: '示例节点',
          interval_hours: Number(body.interval_hours),
          status: 'current',
        },
      });
    }
    return data;
  }
  if (
    ['start', 'stop', 'refresh', 'adopt', 'install'].some((action) =>
      path.endsWith('/' + action),
    )
  ) {
    const entry = data.proxy_runtime!.entries.find((row) => row.id === body.id);
    if (entry && (path.endsWith('/start') || path.endsWith('/stop'))) {
      entry.alive = path.endsWith('/start');
      entry.status = entry.alive ? 'running' : 'stopped';
    }
    return data;
  }
  throw new Error('此代理操作不在演示范围内');
}

export const demoRequest: Request = async <T>(
  path: string,
  params = {},
  body?: unknown,
): Promise<T> => {
  await wait();
  const args = {
    ...params,
    ...((body as Record<string, unknown>) || {}),
  } as Record<string, string>;
  let value: unknown;
  if (path === '/api/environments') value = environments(body);
  else if (/^\/api\/(browser|app)-runtime\/(open|start|stop)$/.test(path))
    value = runtime(path, args);
  else if (path.startsWith('/api/proxy-services/')) value = proxies(path, args);
  else if (path === '/api/settings') {
    if (body) local.settings = { ...local.settings, ...(body as object) };
    value = {
      value: local.settings,
      defaults: initialState().settings,
      sources: [],
    };
  } else if (path === '/api/preferences') {
    if (body) local.preferences = body as typeof local.preferences;
    value = { value: local.preferences, saved: true };
  } else if (
    path.startsWith('/api/account-usage/authorization/') ||
    [
      '/api/account-usage/authorize',
      '/api/account-usage/authorize-complete',
      '/api/account-usage/authorize-cancel',
    ].includes(path)
  ) {
    value = demoAuthorize(path, args);
  } else if (
    ['/api/account-usage/overview', '/api/account-usage/refresh-all'].includes(
      path,
    )
  ) {
    value = {
      items: data.accounts
        .filter((row) => row.provider === 'claude')
        .map((account) =>
          sampleUsage(
            account,
            data.browser.sessions?.[account.profile_id]?.state === 'saved' ||
              data.app_runtime.sessions[account.app_profile_id || '']?.state ===
                'saved',
          ),
        ),
      benchmarks: sampleBenchmarks(),
    };
  } else if (path === '/api/account-usage/benchmarks') {
    value = sampleBenchmarks();
  } else if (path.startsWith('/api/account-usage')) {
    const account = data.accounts.find((row) => row.id === args.account_id)!;
    value = sampleUsage(
      account,
      data.browser.sessions?.[account.profile_id]?.state === 'saved' ||
        data.app_runtime.sessions[account.app_profile_id || '']?.state ===
          'saved',
    );
  } else if (path === '/api/browser-login' || path === '/api/demo/login') {
    const account = data.accounts.find((row) => row.id === args.account_id)!;
    const app = args.target === 'app';
    (app ? data.app_runtime.sessions : data.browser.sessions!)[
      (app ? account.app_profile_id : account.profile_id)!
    ] = { state: 'saved', label: '示例登录状态' };
    value = {
      state: 'verified',
      email: account.name,
      matches: true,
      message: '模拟登录完成',
    };
  } else if (path === '/api/claude-diagnostics/run')
    value = sampleReport(args.proxy || '示例系统路由');
  else if (
    path === '/api/claude-diagnostics/history' ||
    path === '/api/claude-diagnostics/clear'
  )
    value = { history: [] };
  else if (path === '/api/browser-kernel/install')
    value = {
      state: 'ready',
      progress: 100,
      version: '演示版本',
      error: '',
      message: '模拟安装完成',
    };
  else if (path === '/api/browser-runtime/region')
    value = {
      ip: '203.0.113.42',
      country: 'JP',
      locale: 'ja-JP',
      timezone: 'Asia/Tokyo',
    };
  else if (
    path === '/api/app-login/open' ||
    path === '/api/browser-session/import'
  ) {
    const account = data.accounts.find((row) => row.id === args.account_id)!;
    const app = path.startsWith('/api/app-login');
    (app ? data.app_runtime.sessions : data.browser.sessions!)[
      (app ? account.app_profile_id : account.profile_id)!
    ] = { state: 'saved', label: '示例登录状态' };
    value = {
      id: 'demo-login',
      state: app ? 'opened' : 'verified',
      stage: '模拟登录完成',
      error: '',
      email: account.name,
    };
  } else if (
    path === '/api/app-login/cancel' ||
    path === '/api/browser-session/cancel'
  )
    value = {};
  else throw new Error('此操作不在演示范围内，请退出演示后使用。');
  return structuredClone(value) as T;
};
