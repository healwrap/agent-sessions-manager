import { useState } from 'react';
import { Globe2, Plus } from 'lucide-react';
import type {
  EnvironmentSettings,
  ProxyConfig,
} from '../lib/environment-settings';
import type { ProxyCommand } from '../lib/proxy-config';
import {
  Button,
  BusyState,
  CollectionToolbar,
  CollectionPanel,
  EmptyState,
  Notice,
  ResourceRow,
  StatusBadge,
} from './ui';
import { ProxyCoreControl } from './proxy-core-control';
import { ProxyEditor } from './proxy-editor';
import { ProxyActions } from './proxy-actions';

export function ProxyEnvironments({
  data,
  loading,
  busy,
  creating,
  onCreate,
  onCloseCreate,
  onSaveExternal,
  onDelete,
  onInspect,
  onCommand,
  onSavedProxy,
}: {
  data: EnvironmentSettings;
  loading: boolean;
  busy: boolean;
  creating: boolean;
  onCreate: () => void;
  onCloseCreate: () => void;
  onSaveExternal: (item: ProxyConfig) => Promise<EnvironmentSettings>;
  onDelete: (id: string) => void;
  onInspect: (proxy: ProxyConfig) => void;
  onCommand: ProxyCommand;
  onSavedProxy?: (proxy: ProxyConfig) => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const visible = data.proxies.filter((item) =>
    `${item.name} ${item.url}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const closeEditor = () => {
    setSelected('');
    onCloseCreate();
  };
  const saved = (proxy?: ProxyConfig) => {
    setQuery('');
    closeEditor();
    if (proxy) onSavedProxy?.(proxy);
  };
  const editing = data.proxies.find((item) => item.id === selected);
  const inUse = (id: string) =>
    [...data.profiles, ...data.app_profiles].some(
      (profile) =>
        profile.proxy_id === id &&
        [...data.browser.runs, ...data.app_runtime.runs].some(
          (run) =>
            run.profile_id === profile.id &&
            (run.alive || run.status === 'checking'),
        ),
    );
  return (
    <section aria-label="代理配置列表">
      <ProxyCoreControl
        state={data.proxy_runtime}
        busy={busy}
        onInstall={() => void onCommand('install').catch(() => {})}
      />
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
        ) : !visible.length && !creating ? (
          <EmptyState
            icon={<Globe2 size={28} />}
            title={data.proxies.length ? '没有匹配的代理' : '还没有专用代理'}
            action={
              data.proxies.length ? (
                <Button onClick={() => setQuery('')}>清除搜索</Button>
              ) : (
                <Button variant="primary" onClick={onCreate} disabled={busy}>
                  <Plus size={16} />
                  添加代理
                </Button>
              )
            }
          />
        ) : (
          <div
            className="ui-resource-rows environment-resource-grid"
            role="list"
          >
            {visible.map((item) => {
              const service = data.proxy_runtime?.entries.find(
                (row) => row.id === item.id,
              );
              const running = inUse(item.id);
              return (
                <ResourceRow
                  key={item.id}
                  title={item.name}
                  subtitle={<code>{item.url}</code>}
                  icon={<Globe2 size={22} />}
                  actions={
                    <>
                      {service && (
                        <StatusBadge
                          tone={
                            service.alive
                              ? 'success'
                              : service.status === 'failed'
                                ? 'error'
                                : 'neutral'
                          }
                        >
                          {service.alive
                            ? '运行中'
                            : service.status === 'failed'
                              ? '启动失败'
                              : '已停止'}
                        </StatusBadge>
                      )}
                      <ProxyActions
                        item={item}
                        service={service}
                        busy={busy}
                        running={running}
                        adoptable={
                          !!data.proxy_runtime?.adoptable.includes(item.id)
                        }
                        coreAvailable={!!data.proxy_runtime?.core.available}
                        onConfigure={() => {
                          onCloseCreate();
                          setSelected(item.id);
                        }}
                        onCommand={onCommand}
                        onInspect={onInspect}
                        onDelete={onDelete}
                      />
                    </>
                  }
                >
                  {service?.node && (
                    <p className="proxy-node-summary">
                      {service.node.name} · {service.node.type}
                    </p>
                  )}
                  {service?.error && (
                    <Notice tone="error">{service.error}</Notice>
                  )}
                  {service?.subscription?.status === 'pending' && (
                    <Notice>订阅已更新，环境停止后应用</Notice>
                  )}
                  {service?.subscription?.error && (
                    <Notice tone="warning">{service.subscription.error}</Notice>
                  )}
                </ResourceRow>
              );
            })}
          </div>
        )}
      </CollectionPanel>
      {(creating || editing) && (
        <ProxyEditor
          key={creating ? 'new' : editing?.id}
          item={creating ? undefined : editing}
          data={data}
          busy={busy}
          locked={!creating && !!editing && inUse(editing.id)}
          onSaveExternal={onSaveExternal}
          onCommand={onCommand}
          onClose={closeEditor}
          onSaved={saved}
        />
      )}
    </section>
  );
}
