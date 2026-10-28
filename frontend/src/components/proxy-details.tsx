import type { ManagedProxy, ProxyConfig } from '../lib/environment-settings';
import { proxyTime } from '../lib/proxy-config';
import { FactsGrid } from './ui';

export function ProxyDetails({
  item,
  service,
}: {
  item: ProxyConfig;
  service?: ManagedProxy;
}) {
  const subscription = service?.subscription;
  return (
    <FactsGrid
      className="proxy-summary"
      items={[
        {
          label: '管理方式',
          value: item.kind === 'managed' ? '应用管理' : '外部代理地址',
        },
        { label: '本机入口', value: <code>{item.url}</code> },
        ...(service?.node
          ? [
              { label: '当前节点', value: service.node.name },
              { label: '节点类型', value: service.node.type },
            ]
          : []),
        ...(subscription
          ? [
              {
                label: '最近检查',
                value: proxyTime(subscription.last_checked),
              },
              {
                label: '最近应用',
                value: proxyTime(subscription.last_updated),
              },
            ]
          : []),
      ]}
    />
  );
}
