import type { IpReputation } from '../lib/claude-diagnostics';
import { checkedTime } from '../lib/claude-diagnostics';
import { ResourceLink } from './resource-link';

const networkTypes = {
  Residential: '住宅宽带',
  Business: '商业网络',
  Wireless: '无线／移动网络',
  Hosting: '机房／托管网络',
};
const flags = [
  ['proxy', '代理'],
  ['vpn', 'VPN'],
  ['tor', 'Tor'],
  ['hosting', '机房'],
  ['compromised', '被入侵'],
  ['scraper', '爬虫'],
  ['anonymous', '匿名网络'],
] as const;

export function DiagnosticReputation({ value }: { value: IpReputation }) {
  return (
    <>
      <p className="diagnostic-note">
        查询对象：Claude 域名出口 {value.ip || '尚未取得'} · 数据来源{' '}
        <ResourceLink href="https://proxycheck.io/api/">
          {value.provider}
        </ResourceLink>
      </p>
      {value.state === 'ok' ? (
        <>
          <div className="diagnostic-egress">
            <div className="diagnostic-egress-card">
              <span>第三方 IP 风险分</span>
              <strong>
                {value.risk == null ? '未提供' : `${value.risk} / 100`}
              </strong>
              <small>分数越高风险越高</small>
            </div>
            <div className="diagnostic-egress-card">
              <span>网络类型</span>
              <strong>
                {value.network_type ? networkTypes[value.network_type] : '未知'}
              </strong>
              <small>住宅属性与代理标记独立展示</small>
            </div>
          </div>
          <div className="diagnostic-ip-details">
            {flags.map(([key, label]) => {
              const detected = value.detections?.[key];
              return (
                <span key={key}>
                  {label}
                  <strong
                    className="diagnostic-state"
                    data-state={detected === true ? 'warn' : 'info'}
                  >
                    {detected === true
                      ? '已标记'
                      : detected === false
                        ? '未标记'
                        : '未知'}
                  </strong>
                </span>
              );
            })}
          </div>
          <p className="diagnostic-note">
            {value.confidence != null && `来源置信度：${value.confidence}% · `}
            查询时间：{checkedTime(value.queried_at)}
            {value.cached ? '（短时缓存）' : ''}
            {value.updated_at &&
              ` · 来源更新时间：${checkedTime(value.updated_at)}`}
            {value.last_seen &&
              ` · 最近标记时间：${checkedTime(value.last_seen)}`}
          </p>
          <p className="diagnostic-note">
            此分数是 Proxycheck 的 IP
            风险评估；住宅分类不保证独享或未被用作代理，也不代表 Claude
            的账号风控结论。
          </p>
        </>
      ) : (
        <p className="diagnostic-note" role="status">
          信誉查询未完成：{value.message}
        </p>
      )}
    </>
  );
}
