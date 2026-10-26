import { useState } from 'react';
import {
  ArrowLeftRight,
  Globe2,
  PanelsTopLeft,
  Plus,
  ScanLine,
  Users,
} from 'lucide-react';
import type { WorkspacePage } from '../workspace';
import type { EnvironmentSection } from '../lib/environment-settings';
import { useEnvironmentSettings } from '../hooks/use-environment-settings';
import { useSessionStore } from '../hooks/use-session-store';
import { BrowserAccounts } from './browser-accounts';
import { AppAccounts } from './app-accounts';
import { BrowserEnvironments } from './browser-environments';
import {
  EnvironmentDiagnostics,
  type DiagnosticTarget,
} from './environment-diagnostics';
import { EnvironmentEditor, type EnvironmentEdit } from './environment-editor';
import { ProxyEnvironments } from './proxy-environments';
import { Button } from './primitives';
import {
  WorkspaceLayout,
  WorkspaceSidebar,
  WorkspaceSwitch,
} from './workspace-layout';

const sections = [
  {
    id: 'accounts',
    title: '账号管理',
    icon: Users,
    description:
      '将 Claude、Codex 账号绑定独立浏览器环境，按门控策略检查后启动。',
  },
  {
    id: 'browser',
    title: '浏览器管理',
    icon: PanelsTopLeft,
    description: '为每个账号独立配置浏览器、代理、语言、时区与指纹。',
  },
  {
    id: 'claude-app',
    title: 'Claude App 账号',
    icon: ArrowLeftRight,
    description: '管理官方 App 的账号切换入口与独立使用环境。',
  },
  {
    id: 'proxies',
    title: '代理设置',
    icon: Globe2,
    description: '集中保存专用代理，为环境选择对应的网络出口。',
  },
  {
    id: 'diagnostics',
    title: '环境检测',
    icon: ScanLine,
    description: '分别检查网络链路、浏览器窗口与 Claude App 的实际环境。',
  },
] as const;

export function AccountWorkspace({
  onNavigate,
  active = true,
}: {
  onNavigate: (page: WorkspacePage) => void;
  active?: boolean;
}) {
  const [section, setSection] = useState<EnvironmentSection>('browser');
  const [sidebarClosed, setSidebarClosed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>();
  const { settings } = useSessionStore();
  const [edit, setEdit] = useState<EnvironmentEdit | null>(null);
  const [diagnosticTarget, setDiagnosticTarget] =
    useState<DiagnosticTarget>('network');
  const [diagnosticProxy, setDiagnosticProxy] = useState<string>();
  const { data, loading, busy, error, reload, save, remove, runtime } =
    useEnvironmentSettings(active);
  const current = sections.find((item) => item.id === section)!;
  const inspect = (proxy?: string) => {
    setDiagnosticProxy(proxy);
    setDiagnosticTarget('network');
    setSection('diagnostics');
  };
  return (
    <>
      <WorkspaceLayout
        className="account-workspace"
        closed={sidebarClosed}
        animations={settings.animations}
        title="账号与环境管理"
        onExpand={() => setSidebarClosed(false)}
        actions={
          sidebarClosed && (
            <WorkspaceSwitch onClick={() => onNavigate('sessions')}>
              进入会话管理
            </WorkspaceSwitch>
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
            footer={
              <WorkspaceSwitch onClick={() => onNavigate('sessions')}>
                进入会话管理
              </WorkspaceSwitch>
            }
          >
            <nav className="environment-navigation" aria-label="管理功能">
              {sections.map(({ id, title, icon: SectionIcon }) => (
                <button
                  className="panel-row"
                  key={id}
                  aria-current={section === id ? 'page' : undefined}
                  onClick={() => setSection(id)}
                >
                  <SectionIcon size={17} strokeWidth={1.7} />
                  <span>{title}</span>
                  {id === 'accounts' && <small>{data.accounts.length}</small>}
                  {id === 'browser' && <small>{data.profiles.length}</small>}
                  {id === 'proxies' && <small>{data.proxies.length}</small>}
                </button>
              ))}
            </nav>
          </WorkspaceSidebar>
        }
      >
        <div className="environment-content">
          <header className="environment-page-heading">
            <div>
              <span className="environment-breadcrumb">
                账号与环境管理 / {current.title}
              </span>
              <h1>{current.title}</h1>
              <p>{current.description}</p>
            </div>
            <div className="environment-page-actions">
              {section === 'browser' ? (
                <Button
                  variant="primary"
                  onClick={() => setEdit({ kind: 'profiles' })}
                  disabled={loading || busy}
                >
                  <Plus size={16} />
                  新建浏览器环境
                </Button>
              ) : section === 'proxies' ? (
                <Button
                  variant="primary"
                  onClick={() => setEdit({ kind: 'proxies' })}
                  disabled={loading || busy}
                >
                  <Plus size={16} />
                  添加代理
                </Button>
              ) : null}
            </div>
          </header>
          {error && (
            <div className="environment-error-bar" role="alert">
              <span>{error}</span>
              <Button onClick={() => void reload()}>重新读取</Button>
            </div>
          )}
          {section === 'accounts' && (
            <BrowserAccounts
              data={data}
              busy={busy}
              onSave={(item) => save('accounts', item)}
              onDelete={(id) => void remove('accounts', id)}
              onRuntime={(action, body) => void runtime(action, body)}
              onCreateEnvironment={() => setSection('browser')}
            />
          )}
          {section === 'browser' && (
            <BrowserEnvironments
              data={data}
              busy={busy}
              loading={loading}
              onRuntime={(action, body) => void runtime(action, body)}
              onEdit={(item) => setEdit({ kind: 'profiles', item })}
              onDelete={(id) => void remove('profiles', id)}
            />
          )}
          {section === 'claude-app' && (
            <AppAccounts
              data={data}
              loading={loading}
              onInspect={() => {
                setDiagnosticTarget('app');
                setSection('diagnostics');
              }}
            />
          )}
          {section === 'proxies' && (
            <ProxyEnvironments
              data={data}
              busy={busy}
              loading={loading}
              onEdit={(item) => setEdit({ kind: 'proxies', item })}
              onDelete={(id) => void remove('proxies', id)}
              onInspect={inspect}
            />
          )}
          <div
            hidden={section !== 'diagnostics'}
            inert={section !== 'diagnostics'}
          >
            <EnvironmentDiagnostics
              target={diagnosticTarget}
              onTarget={setDiagnosticTarget}
              active={active && section === 'diagnostics'}
              initialProxy={diagnosticProxy}
            />
          </div>
        </div>
      </WorkspaceLayout>
      {edit && (
        <EnvironmentEditor
          edit={edit}
          proxies={data.proxies}
          gates={data.gate_definitions}
          onSave={save}
          onClose={() => setEdit(null)}
        />
      )}
    </>
  );
}
