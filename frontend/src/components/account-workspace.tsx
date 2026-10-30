import { useState } from 'react';
import { AccountGuide, type GuideNetworkResult } from './account-guide';
import { guideStore, useGuide } from '../state/guide-store';
import { isGuideDemo } from '../lib/demo-mode';
import { Globe2, PanelsTopLeft, Plus, Users } from 'lucide-react';
import type { WorkspacePage } from '../workspace';
import type {
  BrowserAccount,
  EnvironmentSection,
  ProxyConfig,
} from '../lib/environment-settings';
import { useEnvironmentSettings } from '../hooks/use-environment-settings';
import { useSessionStore } from '../hooks/use-session-store';
import { BrowserAccounts } from './browser-accounts';
import { AgentIcon } from './agent-icon';
import { AccountEditor } from './account-editor';
import { AppLoginGuide } from './app-login-guide';
import { SessionLogin } from './session-login';
import { AppAccounts } from './app-accounts';
import { BrowserEnvironments } from './browser-environments';
import { NetworkDiagnostics } from './network-diagnostics';
import { EnvironmentEditor, type EnvironmentEdit } from './environment-editor';
import { ProxyEnvironments } from './proxy-environments';
import { Button, ContentDialog, Notice, PageHeading } from './ui';
import { WorkspacePicker } from './workspace-picker';
import { WorkspaceLayout, WorkspaceSidebar } from './workspace-layout';

const sections = [
  {
    id: 'accounts',
    title: '账号管理',
    icon: Users,
    description:
      '管理 Claude、Codex 账号，分别进入独立浏览器或官方 App 登录与切换。',
  },
  {
    id: 'browser',
    title: '浏览器管理',
    icon: PanelsTopLeft,
    description: '为每个账号独立配置浏览器、代理、语言、时区与指纹。',
  },
  {
    id: 'claude-app',
    title: 'Claude App 环境',
    icon: 'claude',
    description: '为每个账号保存官方 App 登录状态、代理与独立 Code 配置。',
  },
  {
    id: 'proxies',
    title: '代理设置',
    icon: Globe2,
    description: '集中保存专用代理，为环境选择对应的网络出口。',
  },
] as const;

export function AccountWorkspace({
  onNavigate,
  active = true,
}: {
  onNavigate: (page: WorkspacePage) => void;
  active?: boolean;
}) {
  const guide = useGuide();
  const [network, setNetwork] = useState<GuideNetworkResult>();
  const [section, setSection] = useState<EnvironmentSection>('accounts');
  const [sidebarClosed, setSidebarClosed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>();
  const { settings } = useSessionStore();
  const [edit, setEdit] = useState<EnvironmentEdit | null>(null);
  const [accountEdit, setAccountEdit] = useState<{ item?: BrowserAccount }>();
  const [loginAccountId, setLoginAccountId] = useState('');
  const [sessionAccountId, setSessionAccountId] = useState('');
  const [diagnosticProxy, setDiagnosticProxy] = useState<ProxyConfig>();
  const {
    data,
    loading,
    busy,
    error,
    reload,
    save,
    provision,
    remove,
    runtime,
    installKernel,
    proxyCommand,
  } = useEnvironmentSettings(active);
  const current = sections.find((item) => item.id === section)!;
  const loginAccount = data.accounts.find((item) => item.id === loginAccountId);
  const sessionAccount = data.accounts.find(
    (item) => item.id === sessionAccountId,
  );
  const sessionProfile = data.profiles.find(
    (item) => item.id === sessionAccount?.profile_id,
  );
  const inspectProxy = (item: ProxyConfig) => {
    setNetwork(undefined);
    if (item.kind === 'managed')
      void proxyCommand('start', { id: item.id })
        .then((latest) => {
          if (
            latest.proxy_runtime?.entries.find((row) => row.id === item.id)
              ?.alive
          )
            setDiagnosticProxy(item);
        })
        .catch(() => {});
    else setDiagnosticProxy(item);
  };
  return (
    <>
      <WorkspaceLayout
        className="account-workspace"
        closed={sidebarClosed}
        animations={settings.animations}
        title={isGuideDemo ? '演示模式' : 'Agent Sessions'}
        onExpand={() => setSidebarClosed(false)}
        actions={
          sidebarClosed && (
            <WorkspacePicker value="accounts" onChange={onNavigate} />
          )
        }
        sidebar={
          <WorkspaceSidebar
            label="账号与环境侧边栏"
            title="账号与环境"
            closed={sidebarClosed}
            width={sidebarWidth}
            onResize={setSidebarWidth}
            onCollapse={() => setSidebarClosed(true)}
            footer={<WorkspacePicker value="accounts" onChange={onNavigate} />}
          >
            <nav className="environment-navigation" aria-label="管理功能">
              {sections.map(({ id, title, icon: SectionIcon }) => (
                <button
                  className="panel-row"
                  key={id}
                  data-guide={id === 'proxies' ? 'proxy-nav' : undefined}
                  aria-current={section === id ? 'page' : undefined}
                  onClick={() => setSection(id)}
                >
                  {typeof SectionIcon === 'string' ? (
                    <AgentIcon source={SectionIcon} monochrome />
                  ) : (
                    <SectionIcon size={17} strokeWidth={1.7} />
                  )}
                  <span>{title}</span>
                </button>
              ))}
            </nav>
          </WorkspaceSidebar>
        }
      >
        <div
          className="environment-content ui-page"
          data-section={section}
          data-guide="account-toolbar"
        >
          <PageHeading
            title={current.title}
            actions={
              <Button
                variant="primary"
                disabled={loading || busy}
                data-guide={
                  section === 'accounts'
                    ? 'account-add'
                    : section === 'proxies'
                      ? 'proxy-add'
                      : undefined
                }
                onClick={() => {
                  if (section === 'accounts') setAccountEdit({});
                  else
                    setEdit({
                      kind:
                        section === 'proxies'
                          ? 'proxies'
                          : section === 'browser'
                            ? 'profiles'
                            : 'app_profiles',
                    });
                }}
              >
                <Plus size={16} />
                {section === 'accounts'
                  ? '添加账号'
                  : section === 'proxies'
                    ? '添加代理'
                    : section === 'browser'
                      ? '新建浏览器环境'
                      : '新建 App 环境'}
              </Button>
            }
          />
          {error && (
            <Notice
              tone="error"
              action={
                <Button
                  size="small"
                  disabled={loading || busy}
                  onClick={() => void reload()}
                >
                  重新读取
                </Button>
              }
            >
              {error}
            </Notice>
          )}
          {section === 'accounts' && (!error || data.accounts.length > 0) && (
            <BrowserAccounts
              active={active}
              guidedAccountId={
                guide.active ? guide.progress?.accountId : undefined
              }
              guidedTarget={guide.active ? guide.progress?.target : undefined}
              data={data}
              busy={busy}
              loading={loading}
              readError={error}
              onLogin={(account) => setLoginAccountId(account.id)}
              onSessionLogin={(account) => setSessionAccountId(account.id)}
              onEditAccount={(item) => setAccountEdit({ item })}
              onDelete={(id) => void remove('accounts', id)}
              onManageBrowser={() => setSection('browser')}
              onRuntime={(action, body, target) =>
                void runtime(action, body, target)
              }
              onEditProfile={(kind, id) => {
                const item = (
                  kind === 'profiles' ? data.profiles : data.app_profiles
                ).find((profile) => profile.id === id);
                if (item) setEdit({ kind, item } as EnvironmentEdit);
              }}
            />
          )}
          {section === 'browser' && (
            <BrowserEnvironments
              data={data}
              busy={busy}
              loading={loading}
              onRuntime={(action, body) => void runtime(action, body)}
              onInstall={(action) => void installKernel(action)}
              onEdit={(item) => setEdit({ kind: 'profiles', item })}
              onDelete={(id) => void remove('profiles', id)}
            />
          )}
          {section === 'claude-app' && (
            <AppAccounts
              data={data}
              busy={busy}
              loading={loading}
              onLogin={(account) => setLoginAccountId(account.id)}
              onEdit={(item) => setEdit({ kind: 'app_profiles', item })}
              onDelete={(id) => void remove('app_profiles', id)}
              onRuntime={(action, body) => void runtime(action, body, 'app')}
            />
          )}
          {section === 'proxies' && (
            <ProxyEnvironments
              data={data}
              busy={busy}
              loading={loading}
              creating={edit?.kind === 'proxies'}
              onCreate={() => setEdit({ kind: 'proxies' })}
              onCloseCreate={() => setEdit(null)}
              onSaveExternal={(item) => save('proxies', item)}
              onDelete={(id) => void remove('proxies', id)}
              onCommand={proxyCommand}
              onInspect={inspectProxy}
              onSavedProxy={(proxy) => guideStore.proxySaved(proxy.id)}
            />
          )}
        </div>
      </WorkspaceLayout>
      {diagnosticProxy && (
        <ContentDialog
          title={`网络检测 · ${diagnosticProxy.name}`}
          className="network-diagnostics-dialog"
          onClose={() => setDiagnosticProxy(undefined)}
        >
          <NetworkDiagnostics
            key={diagnosticProxy.id + diagnosticProxy.url}
            onReport={(report, proxyUrl) =>
              setNetwork({ proxyId: diagnosticProxy.id, proxyUrl, report })
            }
            active={active}
            initialProxy={diagnosticProxy.url}
          />
        </ContentDialog>
      )}
      {accountEdit && (
        <AccountEditor
          account={accountEdit.item}
          data={data}
          busy={busy}
          initialProxyId={guide.active ? guide.progress?.proxyId : undefined}
          onSave={async (item, route) => {
            const latest = await provision(item, route);
            const saved = latest.accounts.find((row) =>
              item.id
                ? row.id === item.id
                : !data.accounts.some((old) => old.id === row.id),
            );
            if (saved) guideStore.accountSaved(saved.id);
          }}
          onClose={() => setAccountEdit(undefined)}
        />
      )}
      {loginAccount && (
        <AppLoginGuide
          key={loginAccount.id}
          account={loginAccount}
          data={data}
          onClose={() => setLoginAccountId('')}
        />
      )}
      {edit && edit.kind !== 'proxies' && (
        <EnvironmentEditor
          edit={edit}
          proxies={data.proxies}
          gates={data.gate_definitions}
          accountName={
            edit.item
              ? data.accounts.find(
                  (account) =>
                    edit.item &&
                    'name_account_id' in edit.item &&
                    account.id === edit.item.name_account_id,
                )?.name
              : undefined
          }
          onSave={(kind, item) => save(kind, item).then(() => {})}
          onClose={() => setEdit(null)}
        />
      )}
      {sessionAccount && sessionProfile && (
        <SessionLogin
          key={sessionAccount.id}
          account={sessionAccount}
          profile={sessionProfile}
          onClose={() => setSessionAccountId('')}
        />
      )}
      <AccountGuide
        data={data}
        active={active}
        loading={loading}
        section={section}
        proxyEditing={edit?.kind === 'proxies'}
        accountEditing={!!accountEdit}
        diagnostic={diagnosticProxy}
        network={network}
        appLoginId={loginAccountId}
        animations={settings.animations}
        onSection={setSection}
        onExpand={() => setSidebarClosed(false)}
        onProxy={() => setEdit({ kind: 'proxies' })}
        onAccount={() => setAccountEdit({})}
        onInspect={inspectProxy}
        onCloseDiagnostic={() => setDiagnosticProxy(undefined)}
        onCloseLogin={() => setLoginAccountId('')}
      />
    </>
  );
}
