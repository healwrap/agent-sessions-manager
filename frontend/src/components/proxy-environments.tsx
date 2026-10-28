import { useState } from 'react';
import {
  Eye,
  Globe2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ScanLine,
  Square,
} from 'lucide-react';
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
  Notice,
  StatusBadge,
} from './ui';
import { ProxyCoreControl } from './proxy-core-control';
import { ProxyDetails } from './proxy-details';

export function ProxyEnvironments({
  data,
  loading,
  busy,
  onEdit,
  onDelete,
  onInspect,
  onCommand,
}: {
  data: EnvironmentSettings;
  loading: boolean;
  busy: boolean;
  onEdit: (item?: ProxyConfig) => void;
  onDelete: (id: string) => void;
  onInspect: (proxy: ProxyConfig) => void;
  onCommand: (
    action: 'install' | 'start' | 'stop' | 'adopt' | 'refresh',
    id?: string,
  ) => void;
}) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ProxyConfig>();
  const visible = data.proxies.filter((item) =>
    `${item.name} ${item.url}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <section aria-label="代理配置列表">
      <ProxyCoreControl
        state={data.proxy_runtime}
        busy={busy}
        onInstall={() => onCommand('install')}
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
          <div
            className="ui-resource-rows environment-resource-grid"
            role="list"
          >
            {visible.map((item) => {
              const service = data.proxy_runtime?.entries.find(
                (row) => row.id === item.id,
              );
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
                      {service && (
                        <Button
                          variant="text"
                          disabled={busy || (service.alive && running)}
                          title={
                            service.alive && running
                              ? '先关闭使用此代理的环境，再停止代理'
                              : undefined
                          }
                          onClick={() =>
                            onCommand(service.alive ? 'stop' : 'start', item.id)
                          }
                        >
                          {service.alive ? (
                            <Square size={16} />
                          ) : (
                            <Play size={16} />
                          )}
                          {service.alive ? '停止' : '启动'}
                        </Button>
                      )}
                      {data.proxy_runtime?.adoptable.includes(item.id) && (
                        <Button
                          disabled={
                            busy ||
                            running ||
                            !data.proxy_runtime.core.available
                          }
                          onClick={() => onCommand('adopt', item.id)}
                        >
                          交给应用管理
                        </Button>
                      )}
                      <Button
                        variant="text"
                        disabled={busy}
                        aria-label={`检测代理 ${item.name}`}
                        onClick={() => onInspect(item)}
                      >
                        <ScanLine size={16} />
                        检测
                      </Button>
                      <IconButton
                        label={`查看代理 ${item.name}`}
                        icon={<Eye size={17} />}
                        onClick={() => setView(item)}
                      />
                      {service?.subscription && (
                        <IconButton
                          label={`更新订阅 ${item.name}`}
                          icon={
                            <RefreshCw
                              size={17}
                              className={
                                service.subscription.status === 'updating'
                                  ? 'ui-spin'
                                  : ''
                              }
                            />
                          }
                          disabled={
                            busy || service.subscription.status === 'updating'
                          }
                          onClick={() => onCommand('refresh', item.id)}
                        />
                      )}
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
      {view && (
        <ProxyDetails
          item={view}
          service={data.proxy_runtime?.entries.find(
            (row) => row.id === view.id,
          )}
          onClose={() => setView(undefined)}
        />
      )}
    </section>
  );
}
