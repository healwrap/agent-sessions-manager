import { MapPin, ShieldCheck, ShieldHalf } from 'lucide-react';
import type { ClaudeReport } from '../lib/claude-diagnostics';
import { checkedTime, routeLabel } from '../lib/claude-diagnostics';
import { countryLabel } from '../lib/diagnostic-labels';
import {
  DiagnosticBadge,
  DiagnosticCard,
  DiagnosticField,
} from './diagnostic-card';
import { ResourceLink } from './resource-link';

const networkTypes = {
  Residential: '住宅宽带',
  Business: '商业网络',
  Wireless: '无线／移动网络',
  Hosting: '机房／托管网络',
};
const flags = [
  ['vpn', 'VPN'],
  ['proxy', '代理 Proxy'],
  ['tor', 'Tor'],
  ['hosting', '机房 Hosting'],
  ['scraper', '爬虫 Crawler'],
  ['abuse', '滥用记录'],
] as const;

export function DiagnosticReputation({ report }: { report: ClaudeReport }) {
  const value = report.ip_reputation;
  const risk = value.trust_score;
  const tone =
    risk == null
      ? 'unknown'
      : risk >= 75
        ? 'pass'
        : risk >= 50
          ? 'warn'
          : 'fail';
  const { ip_details: fallback, exits } = report;
  const details = {
    country: value.metadata?.country || fallback.country,
    region: value.metadata?.region || fallback.region,
    city: value.metadata?.city || fallback.city,
    org: value.metadata?.org || fallback.org,
    timezone: fallback.timezone,
    isp: value.metadata?.isp,
  };
  const organisation = details.org?.match(/^(AS\d+)\s+(.*)$/);
  return (
    <div className="diagnostic-card-grid">
      <DiagnosticCard
        title="IP 信任评分"
        icon={<ShieldHalf size={17} />}
        className="diagnostic-risk-card"
        extra={<DiagnosticBadge state="info">第三方评估</DiagnosticBadge>}
      >
        {value.state === 'ok' ? (
          <>
            <div className="diagnostic-risk-score" data-state={tone}>
              <strong>{risk ?? '—'}</strong>
              <span>/ 100</span>
            </div>
            <p className="diagnostic-risk-caption">
              Net.Coffee 信任分 · 越高越好
            </p>
            {risk != null && (
              <div
                className="diagnostic-risk-scale"
                role="meter"
                aria-label="IP 信任分"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={risk}
                aria-valuetext={`${risk} / 100，信任分越高越好`}
              >
                <div className="diagnostic-risk-track">
                  <i style={{ left: `${risk}%` }} />
                </div>
                <div className="diagnostic-risk-ticks">
                  <span>0 较低</span>
                  <span>25</span>
                  <span>50</span>
                  <span>75</span>
                  <span>100 较高</span>
                </div>
              </div>
            )}
            <div className="diagnostic-score-meta">
              <DiagnosticBadge state={tone}>
                {risk == null ? '评分未提供' : `来源信任分 ${risk}`}
              </DiagnosticBadge>
              {value.confidence != null && (
                <span>来源置信度 {value.confidence}%</span>
              )}
            </div>
          </>
        ) : (
          <div className="diagnostic-risk-empty">
            <DiagnosticBadge>尚未取得评分</DiagnosticBadge>
            <p>{value.message}</p>
          </div>
        )}
        <p className="diagnostic-card-footnote">
          <ResourceLink href={value.source_url || 'https://ip.net.coffee/'}>
            {value.provider}
          </ResourceLink>{' '}
          · {checkedTime(value.queried_at)}
          {value.cached ? ' · 缓存' : ''}
          <br />
          {report.lookup_route && (
            <>
              资料查询：{routeLabel(report.lookup_route)}
              <br />
            </>
          )}
          来源评分用于评估 IP，不等同于 Claude 账号评分。
        </p>
      </DiagnosticCard>
      <DiagnosticCard title="Claude 出口 IP 属性" icon={<MapPin size={17} />}>
        <dl className="diagnostic-fields">
          <DiagnosticField label="地区">
            {countryLabel(details.country || exits.claude.country) || '未知'}
          </DiagnosticField>
          <DiagnosticField label="城市">
            {[details.region, details.city].filter(Boolean).join(' · ') ||
              '未知'}
          </DiagnosticField>
          <DiagnosticField label="网络类型">
            <DiagnosticBadge
              state={
                value.network_type === 'Hosting'
                  ? 'warn'
                  : value.network_type
                    ? 'info'
                    : 'unknown'
              }
            >
              {value.network_type ? networkTypes[value.network_type] : '未知'}
            </DiagnosticBadge>
          </DiagnosticField>
          <DiagnosticField label="ASN">
            <span className="diagnostic-mono">
              {organisation?.[1] || '未知'}
            </span>
          </DiagnosticField>
          <DiagnosticField label="运营商">
            {details.isp || organisation?.[2] || details.org || '未知'}
          </DiagnosticField>
          {details.isp && (
            <DiagnosticField label="ASN 机构">
              {organisation?.[2] || details.org || '未知'}
            </DiagnosticField>
          )}
          <DiagnosticField label="IP 库时区">
            {details.timezone || '未知'}
          </DiagnosticField>
        </dl>
        <p className="diagnostic-card-footnote">
          地区与网络分类 · Net.Coffee
          <br />
          地理库时区 · IPinfo
        </p>
      </DiagnosticCard>
      <DiagnosticCard title="IP 安全标记" icon={<ShieldCheck size={17} />}>
        <dl className="diagnostic-fields">
          {flags.map(([key, label]) => {
            const detected = value.detections?.[key];
            return (
              <DiagnosticField label={label} key={key}>
                <DiagnosticBadge
                  state={
                    detected === true
                      ? 'warn'
                      : detected === false
                        ? 'pass'
                        : 'unknown'
                  }
                >
                  {detected === true
                    ? '已标记'
                    : detected === false
                      ? '未标记'
                      : '未知'}
                </DiagnosticBadge>
              </DiagnosticField>
            );
          })}
        </dl>
        <p className="diagnostic-card-footnote">
          {value.updated_at
            ? `来源更新 · ${checkedTime(value.updated_at)}`
            : '标记来源 · Net.Coffee'}
          {value.last_seen && (
            <>
              <br />
              最近标记 · {checkedTime(value.last_seen)}
            </>
          )}
        </p>
      </DiagnosticCard>
    </div>
  );
}
