import { Globe2, ScanLine, SlidersHorizontal } from 'lucide-react';
import type {
  EnvironmentSettings,
  ProxyConfig,
} from '../lib/environment-settings';
import {
  Button,
  EmptyState,
  Notice,
  RemoveButton,
  ResourceRow,
  StatusBadge,
} from './ui';

export function NetworkLines({
  data,
  query,
  busy,
  onEdit,
  onInspect,
  onDelete,
}: {
  data: EnvironmentSettings;
  query: string;
  busy: boolean;
  onEdit: (item: ProxyConfig) => void;
  onInspect: (item: ProxyConfig) => void;
  onDelete: (id: string) => void;
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
        title={query ? '没有匹配的线路' : '还没有出口线路'}
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
                <span>{item.clash_node}</span>
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
                <StatusBadge tone="neutral">当前出口</StatusBadge>
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
                <RemoveButton
                  label={'移除线路 ' + item.name}
                  disabled={busy || !!accounts}
                  message="移除此出口线路？"
                  onRemove={() => onDelete(item.id)}
                />
              </>
            }
          >
            {data.network?.connected &&
              !data.network.nodes.some(
                (row) => row.name === item.clash_node,
              ) && (
                <Notice tone="warning">
                  绑定节点已不存在，请重新选择线路。
                </Notice>
              )}
          </ResourceRow>
        );
      })}
    </div>
  );
}
