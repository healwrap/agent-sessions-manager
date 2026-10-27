import { useState } from 'react';
import {
  ExternalLink,
  Globe2,
  Monitor,
  PanelsTopLeft,
  SearchX,
} from 'lucide-react';
import {
  Button,
  ChoiceGroup,
  CollectionPanel,
  CollectionToolbar,
  FactsGrid,
  EmptyState,
  MasterDetail,
  ResourceRow,
  SectionHeading,
  StatusBadge,
} from '../components/ui';
import { AgentIcon } from '../components/agent-icon';

const examples = [
  {
    id: 'work',
    name: '工作账号',
    locale: 'en-US',
    timezone: 'America/Los_Angeles',
  },
  { id: 'personal', name: '个人账号', locale: 'ja-JP', timezone: 'Asia/Tokyo' },
];

export function LayoutPreview() {
  const [layout, setLayout] = useState('accounts');
  const [selected, setSelected] = useState('work');
  const [client, setClient] = useState('browser');
  const [query, setQuery] = useState('');
  const [running, setRunning] = useState(false);
  const visible = examples.filter((item) => item.name.includes(query));
  const current = visible.find((item) => item.id === selected) || visible[0];
  return (
    <div className="catalog-layouts ui-stack">
      <SectionHeading
        title="页面组合"
        actions={
          <ChoiceGroup
            label="布局示例"
            value={layout}
            onChange={setLayout}
            items={[
              { value: 'accounts', label: '账号与详情' },
              { value: 'environments', label: '环境列表' },
            ]}
          />
        }
      />
      <CollectionPanel
        toolbar={
          <CollectionToolbar
            query={query}
            onQuery={setQuery}
            searchLabel="搜索布局示例"
          >
            <span>{layout === 'accounts' ? '账号管理' : '浏览器管理'}</span>
          </CollectionToolbar>
        }
      >
        {!visible.length ? (
          <EmptyState
            compact
            icon={<SearchX size={24} />}
            title="没有匹配的示例"
          />
        ) : layout === 'accounts' ? (
          <MasterDetail
            navigation={
              <div
                className="accounts-list"
                role="group"
                aria-label="示例账号列表"
              >
                {visible.map((item) => (
                  <button
                    key={item.id}
                    className="account-list-item"
                    aria-pressed={item.id === selected}
                    onClick={() => setSelected(item.id)}
                  >
                    <span className="account-avatar">
                      <AgentIcon source="claude" />
                    </span>
                    <span className="account-list-identity">
                      <strong>{item.name}</strong>
                      <span>Claude</span>
                    </span>
                    <span />
                  </button>
                ))}
              </div>
            }
          >
            <section className="account-detail" aria-label="示例账号详情">
              <header className="account-detail-header">
                <h2>{current.name}</h2>
              </header>
              <div className="account-client-switch">
                <ChoiceGroup
                  label="示例使用方式"
                  value={client}
                  onChange={setClient}
                  items={[
                    {
                      value: 'browser',
                      label: '独立浏览器',
                      icon: <PanelsTopLeft size={16} />,
                    },
                    {
                      value: 'app',
                      label: 'Claude App',
                      icon: <Monitor size={16} />,
                    },
                  ]}
                />
              </div>
              <div className="account-launch-bar">
                <StatusBadge tone={running ? 'success' : 'neutral'}>
                  {running ? '运行示例' : '已停止'}
                </StatusBadge>
                <Button variant="primary" onClick={() => setRunning(!running)}>
                  <ExternalLink size={16} />
                  {running ? '停止示例' : '打开示例'}
                </Button>
              </div>
              <section className="account-environment-summary">
                <SectionHeading title="工作环境" />
                <FactsGrid
                  items={[
                    { label: '专用代理', value: '工作代理' },
                    { label: '最近出口', value: '尚未检测' },
                    { label: '语言', value: current.locale },
                    { label: '时区', value: current.timezone },
                  ]}
                />
              </section>
            </section>
          </MasterDetail>
        ) : (
          <div role="list">
            {visible.map((item) => (
              <ResourceRow
                key={item.id}
                title={item.name + ' · 浏览器'}
                subtitle="Claude"
                icon={<AgentIcon source="claude" />}
                badge={<StatusBadge>已停止</StatusBadge>}
                actions={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelected(item.id);
                      setLayout('accounts');
                    }}
                  >
                    <ExternalLink size={16} />
                    预览详情
                  </Button>
                }
              >
                <FactsGrid
                  columns={3}
                  items={[
                    {
                      label: '网络出口',
                      icon: <Globe2 size={16} />,
                      value: '工作代理',
                    },
                    { label: '语言', value: item.locale },
                    { label: '时区', value: item.timezone },
                  ]}
                />
              </ResourceRow>
            ))}
          </div>
        )}
      </CollectionPanel>
    </div>
  );
}
