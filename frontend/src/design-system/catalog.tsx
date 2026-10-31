import { useEffect, useState } from 'react';
import { WorkspacePicker } from '../components/workspace-picker';
import type { WorkspacePage } from '../workspace';
import {
  Check,
  ExternalLink,
  Globe2,
  KeyRound,
  Layers3,
  PanelsTopLeft,
  Plus,
  SearchX,
} from 'lucide-react';
import {
  Button,
  BusyState,
  ChoiceGroup,
  CollectionToolbar,
  ContentDialog,
  Disclosure,
  EditorDialog,
  EmptyState,
  FactsGrid,
  Field,
  Notice,
  PageHeading,
  Panel,
  ProgressMeter,
  IconButton,
  Tooltip,
  TooltipLayer,
  ToastLayer,
  toast,
  ResourceCard,
  Select,
  SettingsButton,
  StatusBadge,
  TextInput,
} from '../components/ui';
import './catalog.css';
import { LayoutPreview } from './layout-preview';
import { InputPreview } from './input-preview';
import { GuidePreview } from './guide-preview';
import { ToastPreview } from './toast-preview';
import { StatusPreview } from './status-preview';
import { UpdatePreview } from './update-preview';

export function ComponentCatalog() {
  const [theme, setTheme] = useState('light');
  const [workspace, setWorkspace] = useState<WorkspacePage>('accounts');
  const [tab, setTab] = useState('layouts');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [state, setState] = useState('stopped');
  const [dialog, setDialog] = useState(false);
  const [contentDialog, setContentDialog] = useState(false);
  const [settingsPreview, setSettingsPreview] = useState(false);
  const [name, setName] = useState('工作浏览器');
  const [proxy, setProxy] = useState('dedicated');
  useEffect(() => {
    document.body.toggleAttribute('data-ds-dark-theme', theme === 'dark');
  }, [theme]);
  return (
    <main className="component-catalog ui-page">
      <PageHeading
        title="DSH · 组件预览"
        icon={<Layers3 size={22} />}
        actions={
          <ChoiceGroup
            label="预览主题"
            value={theme}
            onChange={setTheme}
            items={[
              { value: 'light', label: '浅色' },
              { value: 'dark', label: '深色' },
            ]}
          />
        }
      />
      <ChoiceGroup
        label="组件预览分类"
        variant="tabs"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'layouts', label: '组合布局' },
          { value: 'components', label: '基础组件' },
          { value: 'tokens', label: 'DSH 变量' },
        ]}
      />
      {tab === 'layouts' ? (
        <LayoutPreview />
      ) : tab === 'tokens' ? (
        <div className="catalog-grid">
          <Panel title="DSH 原始颜色变量">
            <div className="catalog-swatches">
              {[
                '--dsw-alias-button-primary-fill',
                '--dsw-alias-bg-layer-1',
                '--dsw-alias-settings-card-fill',
                '--dsw-alias-bg-module-platform',
                '--dsw-alias-settings-card-stroke',
              ].map((token) => (
                <div key={token}>
                  <span style={{ background: `var(${token})` }} />
                  <code>{token}</code>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="排版与间距">
            <FactsGrid
              items={[
                { label: '正文', value: '14 px / 22 px' },
                { label: '标准按钮', value: '36 px · R12' },
                { label: '紧凑按钮', value: '28 px · R8' },
                { label: '输入框', value: '32 px · R12' },
                { label: '设置卡片', value: 'R20 · 0.5 px 描边' },
                { label: '分段选择', value: 'DSH 滑动指示器' },
              ]}
            />
          </Panel>
        </div>
      ) : (
        <div className="catalog-grid">
          <InputPreview />
          <ToastPreview />
          <Panel title="悬浮提示">
            <div className="ui-actions">
              <IconButton label="重新授权" icon={<KeyRound size={17} />} />
              <Button title="稍后可刷新账号用量" disabled>
                禁用操作
              </Button>
              <Tooltip label="完整路径：/Users/example/Library/Application Support/Agent Sessions/profiles/work">
                <span tabIndex={0}>悬停或使用 Tab 查看完整路径</span>
              </Tooltip>
            </div>
          </Panel>
          <Panel title="额度进度">
            {[26, 85, 100].map((value) => (
              <div key={value}>
                <p>{value}% 已用</p>
                <ProgressMeter label={`${value}% 用量`} value={value} />
              </div>
            ))}
          </Panel>
          <StatusPreview onCreate={() => setDialog(true)} />
          <UpdatePreview />
          <Panel title="工具栏与筛选">
            <CollectionToolbar
              query={query}
              onQuery={setQuery}
              searchLabel="搜索示例"
            >
              <ChoiceGroup
                label="示例筛选"
                value={filter}
                onChange={setFilter}
                items={[
                  { value: 'all', label: '全部', count: 3 },
                  { value: 'running', label: '运行中', count: 1 },
                ]}
              />
            </CollectionToolbar>
            <EmptyState
              compact
              icon={<SearchX size={25} />}
              title={
                query
                  ? `没有匹配“${query}”的示例`
                  : filter === 'running'
                    ? '运行中的环境'
                    : '搜索与筛选预览'
              }
            />
          </Panel>
          <div className="ui-stack">
            <ChoiceGroup
              label="资源卡片状态"
              value={state}
              onChange={setState}
              items={[
                { value: 'stopped', label: '停止' },
                { value: 'running', label: '运行' },
                { value: 'blocked', label: '拦截' },
              ]}
            />
            <ResourceCard
              title={name}
              subtitle="Claude · 示例环境"
              icon={<PanelsTopLeft size={23} />}
              badge={
                <StatusBadge
                  tone={
                    state === 'running'
                      ? 'success'
                      : state === 'blocked'
                        ? 'error'
                        : 'neutral'
                  }
                >
                  {state === 'running'
                    ? '运行中'
                    : state === 'blocked'
                      ? '已拦截'
                      : '已停止'}
                </StatusBadge>
              }
              actions={
                <Button
                  variant="primary"
                  onClick={() =>
                    setState(state === 'running' ? 'stopped' : 'running')
                  }
                >
                  <ExternalLink size={16} />
                  {state === 'running' ? '停止示例' : '打开示例'}
                </Button>
              }
              footer={
                <Disclosure title="启动检查">
                  <Notice tone={state === 'blocked' ? 'error' : 'success'}>
                    {state === 'blocked'
                      ? '示例：专用代理连接失败'
                      : '示例：代理连接通过'}
                  </Notice>
                </Disclosure>
              }
            >
              <FactsGrid
                items={[
                  {
                    label: '专用代理',
                    icon: <Globe2 size={16} />,
                    value: '工作代理',
                  },
                  { label: '语言', value: 'en-US' },
                  { label: '时区', value: 'America/Los_Angeles' },
                  {
                    label: '登录凭据',
                    icon: <Check size={16} />,
                    value: '已保存',
                  },
                ]}
              />
            </ResourceCard>
          </div>
          <Panel title="反馈与空状态">
            <Notice tone="success">当前出口与账号配置一致</Notice>
            <Notice tone="warning">当前环境尚未绑定节点</Notice>
            <Notice
              tone="error"
              action={
                <Button onClick={() => toast('已触发重试示例。')}>
                  重试示例
                </Button>
              }
            >
              示例：无法连接代理
            </Notice>
            <BusyState label="正在检查环境" />
          </Panel>
          <Panel title="表单与弹窗">
            <div className="ui-stack">
              <Field label="环境名称" htmlFor="catalog-name">
                <TextInput
                  id="catalog-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field label="专用代理">
                <Select
                  label="示例代理"
                  value={proxy}
                  onChange={setProxy}
                  options={[
                    { value: 'dedicated', label: '工作代理' },
                    { value: 'system', label: '系统路由' },
                  ]}
                />
              </Field>
              <Button onClick={() => setDialog(true)}>预览编辑弹窗</Button>
              <Button onClick={() => setContentDialog(true)}>
                预览内容弹窗
              </Button>
            </div>
          </Panel>
          <Panel title="工作区导航">
            <div className="workspace-sidebar-actions">
              <WorkspacePicker value={workspace} onChange={setWorkspace} />
              <SettingsButton onClick={() => setSettingsPreview(true)} />
            </div>
          </Panel>
          <GuidePreview />
          <Panel title="空列表">
            <EmptyState
              icon={<PanelsTopLeft size={28} />}
              title="还没有浏览器环境"
              action={
                <Button variant="primary" onClick={() => setDialog(true)}>
                  <Plus size={16} />
                  新建环境
                </Button>
              }
            />
          </Panel>
        </div>
      )}
      {settingsPreview && (
        <ContentDialog title="设置" onClose={() => setSettingsPreview(false)}>
          <Field label="外观">
            <ChoiceGroup
              label="示例外观设置"
              value={theme}
              onChange={setTheme}
              items={[
                { value: 'light', label: '浅色' },
                { value: 'dark', label: '深色' },
              ]}
            />
          </Field>
        </ContentDialog>
      )}
      {contentDialog && (
        <ContentDialog
          title="检测结果 · 组件预览"
          description="标题与关闭按钮共用一行，说明文字在下方独立展示。"
          onClose={() => setContentDialog(false)}
          footer={<Button onClick={() => setContentDialog(false)}>关闭</Button>}
        >
          <FactsGrid
            items={[
              { label: '代理', value: '工作代理' },
              {
                label: '连接状态',
                value: <StatusBadge tone="success">通过</StatusBadge>,
              },
            ]}
          />
          <Field label="订阅链接">
            <code className="proxy-source-url">
              https://example.com/subscription/agent-sessions?profile=work&amp;region=tokyo&amp;format=clash&amp;subscription=example-long-subscription-link
            </code>
          </Field>
        </ContentDialog>
      )}
      {dialog && (
        <EditorDialog
          title="新建环境 · 组件预览"
          busy={false}
          onClose={() => setDialog(false)}
          onSubmit={(event) => {
            event.preventDefault();
            setDialog(false);
            toast('配置已保存。', { tone: 'success' });
          }}
          footer={
            <>
              <Button onClick={() => setDialog(false)}>取消</Button>
              <Button type="submit" variant="primary">
                保存示例
              </Button>
            </>
          }
        >
          <Field label="环境名称" htmlFor="catalog-dialog-name">
            <TextInput
              id="catalog-dialog-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Disclosure title="启动门控">
            <Field label="代理连接">
              <Select
                label="示例代理门控"
                value="block"
                onChange={() => {}}
                options={[{ value: 'block', label: '强制拦截' }]}
              />
            </Field>
          </Disclosure>
        </EditorDialog>
      )}
      <TooltipLayer />
      <ToastLayer />
    </main>
  );
}
