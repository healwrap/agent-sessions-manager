import { useState } from 'react';
import { Globe2, Pencil, Plus, ScanLine } from 'lucide-react';
import type {
  EnvironmentSettings,
  ProxyConfig,
} from '../lib/environment-settings';
import {
  Button,
  BusyState,
  CollectionToolbar,
  CollectionPanel,
  EmptyState,
  IconButton,
  RemoveButton,
  ResourceRow,
  StatusBadge,
} from './ui';

export function ProxyEnvironments({
  data,
  loading,
  busy,
  onEdit,
  onDelete,
  onInspect,
}: {
  data: EnvironmentSettings;
  loading: boolean;
  busy: boolean;
  onEdit: (item?: ProxyConfig) => void;
  onDelete: (id: string) => void;
  onInspect: (proxy: string) => void;
}) {
  const [query, setQuery] = useState('');
  const visible = data.proxies.filter((item) =>
    `${item.name} ${item.url}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <section aria-label="代理配置列表">
      <CollectionPanel
        toolbar={
          <CollectionToolbar
            query={query}
            onQuery={setQuery}
            searchLabel="搜索代理"
          >
            <span className="ui-collection-count">
              {data.proxies.length} 个专用代理
            </span>
          </CollectionToolbar>
        }
      >
        {loading && !data.proxies.length ? (
          <BusyState label="正在读取代理" />
        ) : !visible.length ? (
          <EmptyState
            icon={<Globe2 size={28} />}
            title={data.proxies.length ? '没有匹配的代理' : '还没有专用代理'}
            action={
              data.proxies.length ? (
                <Button onClick={() => setQuery('')}>清除搜索</Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => onEdit()}
                  disabled={busy}
                >
                  <Plus size={16} />
                  添加代理
                </Button>
              )
            }
          />
        ) : (
          <div className="ui-resource-rows" role="list">
            {visible.map((item) => {
              const bindings = [...data.profiles, ...data.app_profiles].filter(
                (profile) => profile.proxy_id === item.id,
              );
              const running = bindings.some((profile) =>
                [...data.browser.runs, ...data.app_runtime.runs].some(
                  (run) =>
                    run.profile_id === profile.id &&
                    (run.alive || run.status === 'checking'),
                ),
              );
              return (
                <ResourceRow
                  key={item.id}
                  title={item.name}
                  icon={<Globe2 size={22} />}
                  badge={<StatusBadge>{bindings.length} 个环境</StatusBadge>}
                  actions={
                    <>
                      <Button
                        variant="text"
                        aria-label={`检测代理 ${item.name}`}
                        onClick={() => onInspect(item.url)}
                      >
                        <ScanLine size={16} />
                        检测
                      </Button>
                      <IconButton
                        label={`编辑代理 ${item.name}`}
                        icon={<Pencil size={17} />}
                        disabled={busy || running}
                        title={
                          running
                            ? '先停止使用此代理的环境，再编辑'
                            : `编辑代理 ${item.name}`
                        }
                        onClick={() => onEdit(item)}
                      />
                      <RemoveButton
                        label={`移除代理配置 ${item.name}`}
                        disabled={busy || running}
                        message="移除此代理配置？绑定此代理的环境需要重新选择出口。"
                        onRemove={() => onDelete(item.id)}
                      />
                    </>
                  }
                >
                  <p className="ui-resource-address">{item.url}</p>
                  {!!bindings.length && (
                    <div
                      className="proxy-binding-list"
                      aria-label="使用此代理的环境"
                    >
                      {bindings.map((profile) => (
                        <span key={profile.id}>{profile.name}</span>
                      ))}
                    </div>
                  )}
                </ResourceRow>
              );
            })}
          </div>
        )}
      </CollectionPanel>
    </section>
  );
}
