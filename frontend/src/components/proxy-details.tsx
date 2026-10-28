import type { ManagedProxy, ProxyConfig } from '../lib/environment-settings';
import { Button, ContentDialog, FactsGrid, Field, Notice } from './ui';

export const subscriptionInterval = (hours: number) =>
  hours ? `每 ${hours} 小时` : '关闭';
const time = (value?: number) =>
  value ? new Date(value * 1000).toLocaleString() : '尚未检查';

export function ProxyDetails({
  item,
  service,
  onClose,
}: {
  item: ProxyConfig;
  service?: ManagedProxy;
  onClose: () => void;
}) {
  const subscription = service?.subscription;
  return (
    <ContentDialog
      title="查看代理配置"
      onClose={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      <FactsGrid
        items={[
          { label: '名称', value: item.name },
          {
            label: '管理方式',
            value: item.kind === 'managed' ? '应用管理' : '外部代理地址',
          },
          { label: '本机入口', value: <code>{item.url}</code> },
          ...(service
            ? [
                {
                  label: '状态',
                  value: service.alive
                    ? '运行中'
                    : service.status === 'failed'
                      ? '启动失败'
                      : '已停止',
                },
                { label: '所选节点', value: service.node?.name || '未取得' },
                { label: '节点类型', value: service.node?.type || '未取得' },
              ]
            : []),
        ]}
      />
      {service && (
        <Field label="直连域名">
          <div>
            {service.direct_domains.length
              ? service.direct_domains.join('、')
              : '未配置'}
          </div>
        </Field>
      )}
      {subscription && (
        <>
          <Field label="订阅链接">
            <code className="proxy-source-url">{subscription.url}</code>
          </Field>
          <FactsGrid
            items={[
              {
                label: '自动更新',
                value: subscriptionInterval(subscription.interval_hours),
              },
              { label: '最近检查', value: time(subscription.last_checked) },
              { label: '最近应用', value: time(subscription.last_updated) },
            ]}
          />
          {subscription.status === 'pending' && (
            <Notice>新配置待应用，环境停止后生效</Notice>
          )}
          {subscription.error && (
            <Notice tone="warning">{subscription.error}</Notice>
          )}
        </>
      )}
      {service?.error && <Notice tone="error">{service.error}</Notice>}
    </ContentDialog>
  );
}
