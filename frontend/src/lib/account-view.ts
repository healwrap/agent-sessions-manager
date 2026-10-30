import type {
  BrowserAccount,
  BrowserRun,
  EnvironmentSettings,
  LocalSession,
  ProfileRoute,
} from './environment-settings';
import { browserAvailable } from './environment-settings';

export interface AccountClient {
  target: 'browser' | 'app';
  title: string;
  profile?: ProfileRoute;
  run?: BrowserRun;
  session?: LocalSession;
  available: boolean;
}

export interface AccountActions {
  onEditAccount: (account?: BrowserAccount) => void;
  onDelete: (id: string) => void;
  onLogin: (account: BrowserAccount) => void;
  onSessionLogin: (account: BrowserAccount) => void;
  onEditProfile: (kind: 'profiles' | 'app_profiles', id: string) => void;
  onManageBrowser: () => void;
  onRuntime: (
    action: 'open' | 'stop',
    body: { profile_id?: string; account_id?: string },
    target: 'browser' | 'app',
  ) => void;
}

export function accountClients(
  account: BrowserAccount,
  data: EnvironmentSettings,
): AccountClient[] {
  const browser = data.profiles.find((row) => row.id === account.profile_id);
  const app = data.app_profiles.find(
    (row) => row.id === account.app_profile_id,
  );
  return [
    {
      target: 'browser',
      title: '独立浏览器',
      profile: browser,
      run: data.browser.runs.find((row) => row.profile_id === browser?.id),
      session: browser ? data.browser.sessions?.[browser.id] : undefined,
      available: browserAvailable(data, browser),
    },
    ...(account.provider === 'claude'
      ? [
          {
            target: 'app' as const,
            title: 'Claude App',
            profile: app,
            run: data.app_runtime.runs.find(
              (row) => row.profile_id === app?.id,
            ),
            session: app ? data.app_runtime.sessions[app.id] : undefined,
            available: data.apps.some((row) => row.id === 'claude'),
          },
        ]
      : []),
  ];
}

export function clientIssue(client: AccountClient) {
  if (!client.profile) return '尚未绑定环境';
  if (!client.available)
    return client.target === 'browser'
      ? client.profile &&
        'engine' in client.profile &&
        client.profile.engine === 'chrome'
        ? 'Google Chrome 环境已停用，请新建 Fingerprint Chromium 环境'
        : '尚未安装 Fingerprint Chromium'
      : '尚未安装 Claude App';
  if (['blocked', 'failed', 'interrupted'].includes(client.run?.status || ''))
    return (
      client.run?.error ||
      client.run?.checks.find(
        (check) => check.policy === 'block' && check.state !== 'pass',
      )?.value ||
      client.run?.stage
    );
  return '';
}
