import type { ReactNode } from 'react';
import {
  checkLabels,
  checkedTime,
  routeLabel,
  type ClaudeReport,
  type DiagnosticHistory,
  type DiagnosticItem,
} from '../lib/claude-diagnostics';
import { Icon } from './primitives';
import { countryLabel, exitDescription } from '../lib/diagnostic-labels';

export function DiagnosticSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="diagnostic-section">
      <h3>{title}</h3>
      {note && <p className="diagnostic-note">{note}</p>}
      {children}
    </section>
  );
}

export function DiagnosticRows({ items }: { items: DiagnosticItem[] }) {
  return (
    <div className="diagnostic-rows">
      {items.map((item) => (
        <div className="diagnostic-row" key={item.id}>
          <span className="diagnostic-state" data-state={item.state}>
            <Icon
              name={
                item.state === 'pass'
                  ? 'check'
                  : item.state === 'fail'
                    ? 'close'
                    : 'info'
              }
            />
            {checkLabels[item.state]}
          </span>
          <div className="diagnostic-row-content">
            <div className="diagnostic-row-heading">
              <strong>{item.title}</strong>
              <span>{item.scope}</span>
            </div>
            <div className="diagnostic-value">{item.value}</div>
            {item.detail && <p>{item.detail}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DiagnosticEgress({ report }: { report: ClaudeReport }) {
  const { claude, cloudflare } = report.exits;
  const location = [
    countryLabel(report.ip_details.country || claude.country),
    report.ip_details.region,
    report.ip_details.city,
  ]
    .filter(Boolean)
    .join(' · ');
  const split = claude.ip && cloudflare.ip && claude.ip !== cloudflare.ip;
  return (
    <>
      <div className="diagnostic-egress">
        {[
          ['Claude 域名出口', claude],
          ['Cloudflare 域名出口', cloudflare],
        ].map(([title, value]) => {
          const exit = value as typeof claude;
          return (
            <div className="diagnostic-egress-card" key={String(title)}>
              <span>{String(title)}</span>
              <strong>{exit.ip || '未取得'}</strong>
              <small>{exitDescription(exit) || '查看下方连接结果'}</small>
            </div>
          );
        })}
      </div>
      <div className="diagnostic-ip-details">
        <span>
          地区<strong>{location || '未取得'}</strong>
        </span>
        <span>
          ASN / 运营商<strong>{report.ip_details.org || '未取得'}</strong>
        </span>
        <span>
          IP 地理库时区<strong>{report.ip_details.timezone || '未取得'}</strong>
        </span>
      </div>
      <p className="diagnostic-note">
        {split ? '两个域名取得不同出口，当前链路存在分流。' : ''}
        地区与运营商数据来自 IPinfo；IP 信誉与网络类型见下方。
      </p>
    </>
  );
}

export function DiagnosticHistoryList({
  items,
}: {
  items: DiagnosticHistory[];
}) {
  if (!items.length)
    return (
      <p className="diagnostic-note">
        运行检测后，本机会保存最近 30 次出口记录。
      </p>
    );
  return (
    <div className="diagnostic-history">
      {items.map((item, index) => (
        <div key={item.checked_at + index}>
          <time>{checkedTime(item.checked_at)}</time>
          <strong>{item.claude_ip || 'Claude 出口未取得'}</strong>
          <span>{routeLabel(item.route)}</span>
          <small>
            {[countryLabel(item.country), item.org].filter(Boolean).join(' · ')}
          </small>
        </div>
      ))}
    </div>
  );
}
