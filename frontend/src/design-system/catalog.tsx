import { useEffect, useState } from 'react';
import { WorkspacePicker } from '../components/workspace-picker';
import type { WorkspacePage } from '../workspace';
import {
  Check,
  ExternalLink,
  Globe2,
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
  Disclosure,
  EditorDialog,
  EmptyState,
  FactsGrid,
  Field,
  Notice,
  PageHeading,
  Panel,
  ResourceCard,
  Select,
  StatusBadge,
  TextInput,
} from '../components/ui';
import './catalog.css';

export function ComponentCatalog() {
  const [theme, setTheme] = useState('light');
  const [workspace, setWorkspace] = useState<WorkspacePage>('accounts');
  const [tab, setTab] = useState('components');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [state, setState] = useState('stopped');
  const [dialog, setDialog] = useState(false);
  const [name, setName] = useState('工作浏览器');
  const [proxy, setProxy] = useState('dedicated');
  const [notice, setNotice] = useState(false);
  useEffect(() => {
    document.body.toggleAttribute('data-ds-dark-theme', theme === 'dark');
  }, [theme]);
  return (
    <main className="component-catalog ui-page">
      <PageHeading
        title="Agent Sessions · 组件预览"
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
          { value: 'components', label: '组件与交互' },
          { value: 'tokens', label: '设计变量' },
        ]}
      />
      {tab === 'tokens' ? (
        <div className="catalog-grid">
          <Panel title="颜色">
            <div className="catalog-swatches">
              {[
                '--ui-accent',
                '--ui-canvas',
                '--ui-panel',
                '--ui-soft',
                '--ui-line',
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
                { label: '正文', value: '15 px' },
                { label: '控件文字', value: '14 px' },
                { label: '页面标题', value: '23 px' },
                { label: '区块间距', value: '20 px' },
                { label: '圆角', value: 'DSH radius-lg' },
                { label: '过渡', value: '160 ms' },
              ]}
            />
          </Panel>
        </div>
      ) : (
        <div className="catalog-grid">
          <Panel title="按钮与状态">
            <div className="ui-actions">
              <Button variant="primary" onClick={() => setDialog(true)}>
                <Plus size={16} />
                新建环境
              </Button>
              <Button>次要操作</Button>
              <Button variant="text">文字按钮</Button>
              <Button disabled>不可用</Button>
            </div>
            <div className="catalog-statuses">
              <StatusBadge>未启动</StatusBadge>
              <StatusBadge tone="success">运行中</StatusBadge>
              <StatusBadge tone="warning">检查中</StatusBadge>
              <StatusBadge tone="error">已拦截</StatusBadge>
            </div>
          </Panel>
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
            <Notice tone="success">配置已保存</Notice>
            <Notice tone="warning">检测结果需要确认</Notice>
            <Notice
              tone="error"
              action={<Button onClick={() => setNotice(true)}>重试示例</Button>}
            >
              示例：无法连接代理
            </Notice>
            {notice && <Notice>已触发重试示例</Notice>}
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
            </div>
          </Panel>
          <Panel title="工作区导航">
            <WorkspacePicker value={workspace} onChange={setWorkspace} />
          </Panel>
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
      {dialog && (
        <EditorDialog
          title="新建环境 · 组件预览"
          busy={false}
          onClose={() => setDialog(false)}
          onSubmit={(event) => {
            event.preventDefault();
            setDialog(false);
            setNotice(true);
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
              autoFocus
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
    </main>
  );
}
