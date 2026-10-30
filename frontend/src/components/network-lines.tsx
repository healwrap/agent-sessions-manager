import { Globe2, ScanLine, SlidersHorizontal } from 'lucide-react';
import type {
  EnvironmentSettings,
  ProxyConfig,
} from '../lib/environment-settings';
import { Button, EmptyState, Notice, ResourceRow, StatusBadge } from './ui';
import {
  NetworkNodeDelete,
  type NodeEnvironmentEdit,
} from './network-node-delete';

export function NetworkLines({
  data,
  query,
  busy,
  onEdit,
  onInspect,
  onDelete,
  onEditEnvironment,
}: {
  data: EnvironmentSettings;
  query: string;
  busy: boolean;
  onEdit: (item: ProxyConfig) => void;
  onInspect: (item: ProxyConfig) => void;
  onDelete: (id: string) => void;
  onEditEnvironment: (edit: NodeEnvironmentEdit) => void;
}) {
  const rows = data.proxies.filter((row) =>
    (row.name + ' ' + row.clash_node)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  if (!rows.length)
    return (
      <EmptyState
        icon={<Globe2 size={28} />}
        title={query ? '没有匹配的节点' : '还没有 Claude 专用节点'}
      />
    );
  const bound = (id: string) =>
    data.accounts
      .filter((account) =>
        [
          data.profiles.find((row) => row.id === account.profile_id),
          data.app_profiles.find((row) => row.id === account.app_profile_id),
        ].some((row) => row?.proxy_id === id),
      )
      .map((row) => row.name)
      .join('、');
  const latest = (id: string) => {
    const ids = new Set(
      [...data.profiles, ...data.app_profiles]
        .filter((row) => row.proxy_id === id)
        .map((row) => row.id),
    );
    return [...data.browser.runs, ...data.app_runtime.runs]
      .filter((row) => ids.has(row.profile_id) && row.resolved.ip)
      .sort((a, b) => b.checked_at.localeCompare(a.checked_at))[0];
  };
  return (
    <div role="list">
      {rows.map((item) => {
        const previous = latest(item.id);
        const accounts = bound(item.id);
        return (
          <ResourceRow
            key={item.id}
            className="network-line"
            title={item.name}
            subtitle={
              <span className="network-line-meta">
                <span>
                  {item.node
                    ? `${item.node.type.toUpperCase()} · ${item.node.server}:${item.node.port}`
                    : item.clash_node}
                </span>
                {accounts && <span>{accounts}</span>}
                {previous && (
                  <span title={new Date(previous.checked_at).toLocaleString()}>
                    最近预检 · {previous.resolved.ip}{' '}
                    {previous.resolved.country}
                  </span>
                )}
              </span>
            }
            icon={<Globe2 size={22} />}
            badge={
              data.network?.current_node === item.clash_node ? (
                <StatusBadge tone="neutral">已选节点</StatusBadge>
              ) : undefined
            }
            actions={
              <>
                <Button
                  disabled={busy}
                  data-guide-proxy-id={item.id}
                  onClick={() => onInspect(item)}
                >
                  <ScanLine size={16} />
                  检测
                </Button>
                <Button disabled={busy} onClick={() => onEdit(item)}>
                  <SlidersHorizontal size={16} />
                  配置
                </Button>
                <NetworkNodeDelete
                  item={item}
                  data={data}
                  busy={busy}
                  onEditEnvironment={onEditEnvironment}
                  onDelete={onDelete}
                />
              </>
            }
          >
            {data.network?.connected &&
              !data.network.nodes.some(
                (row) => row.name === item.clash_node,
              ) && <Notice tone="warning">请配置 Claude 专用节点。</Notice>}
          </ResourceRow>
        );
      })}
    </div>
  );
}
