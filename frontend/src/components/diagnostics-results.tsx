import type { ReactNode } from 'react';
import {
  checkLabels,
  checkedTime,
  type ClaudeReport,
  type DiagnosticHistory,
  type DiagnosticItem,
} from '../lib/claude-diagnostics';
import { Icon } from './primitives';
import { Clock3, Globe2 } from 'lucide-react';
import cloudflareIcon from '../assets/agents/cloudflare.svg';
import { countryFlag, countryLabel, nodeLabel } from '../lib/diagnostic-labels';
import { AgentIcon } from './agent-icon';
import { DiagnosticBadge, DiagnosticCard } from './diagnostic-card';
import { DnsResolvers } from './dns-resolvers';

export function DiagnosticSection({
  title,
  note,
  actions,
  children,
}: {
  title: string;
  note?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="diagnostic-section">
      <header className="diagnostic-section-heading">
        <h3>{title}</h3>
        {actions}
      </header>
      {note && <p className="diagnostic-note">{note}</p>}
      {children}
    </section>
  );
}

export function DiagnosticRows({
  items,
  showScope = false,
}: {
  items: DiagnosticItem[];
  showScope?: boolean;
}) {
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
            {item.label || checkLabels[item.state]}
          </span>
          <div className="diagnostic-row-content">
            <div className="diagnostic-row-heading">
              <strong>{item.title}</strong>
              {showScope && <span>{item.scope}</span>}
            </div>
            {item.observation?.kind === 'dns' &&
            item.observation.servers.length ? (
              <DnsResolvers servers={item.observation.servers} />
            ) : (
              <div className="diagnostic-value">{item.value}</div>
            )}
            {item.detail &&
              ['warn', 'fail', 'unknown'].includes(item.state) && (
                <p>{item.detail}</p>
              )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DiagnosticEgress({ report }: { report: ClaudeReport }) {
  const { claude, cloudflare } = report.exits;
  const split = claude.ip && cloudflare.ip && claude.ip !== cloudflare.ip;
  return (
    <>
      <div className="diagnostic-egress">
        {[
          {
            title: 'Claude 域名出口',
            exit: claude,
            brand: 'claude',
            icon: <AgentIcon source="claude" />,
          },
          {
            title: 'Cloudflare 域名出口',
            exit: cloudflare,
            brand: 'cloudflare',
            icon: (
              <img
                className="diagnostic-cloudflare-logo"
                src={cloudflareIcon}
                alt=""
                aria-hidden="true"
              />
            ),
          },
        ].map(({ title, exit, brand, icon }) => {
          return (
            <DiagnosticCard
              key={title}
              title={title}
              icon={icon}
              className={'diagnostic-egress-card diagnostic-egress-' + brand}
              extra={
                <DiagnosticBadge state={exit.ip ? 'info' : 'unknown'}>
                  <Clock3 size={11} />
                  {exit.ms == null ? '未取得' : `${exit.ms} ms`}
                </DiagnosticBadge>
              }
            >
              <div className="diagnostic-egress-ip">
                <span className="diagnostic-flag" aria-hidden="true">
                  {countryFlag(exit.country) || <Globe2 size={25} />}
                </span>
                <strong>{exit.ip || '出口未取得'}</strong>
              </div>
              <p className="diagnostic-egress-location">
                {exit.error || countryLabel(exit.country) || '地区未知'}
                {(exit.attempts || 0) > 1 && <span>已重试一次</span>}
                {exit.colo && <span>边缘节点 · {nodeLabel(exit.colo)}</span>}
              </p>
            </DiagnosticCard>
          );
        })}
      </div>
      {split && (
        <p className="diagnostic-route-note">
          <Globe2 size={13} />
          两个域名使用不同出口，当前链路存在分流。
        </p>
      )}
    </>
  );
}

export function DiagnosticHistoryList({
  items,
}: {
  items: DiagnosticHistory[];
}) {
  if (!items.length) return <p className="diagnostic-note">暂无检测记录</p>;
  return (
    <div className="diagnostic-history">
      <table aria-label="出口检测历史">
        <thead>
          <tr>
            <th scope="col">检测时间</th>
            <th scope="col">出口 IP</th>
            <th scope="col">检测链路</th>
            <th scope="col">地区与运营商</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.checked_at + index}>
              <td>
                <time dateTime={item.checked_at}>
                  {checkedTime(item.checked_at)}
                </time>
              </td>
              <td>
                <span className="diagnostic-mono">
                  {item.claude_ip || '未取得'}
                </span>
              </td>
              <td>
                <span>{item.route.label}</span>
                {item.route.endpoint && (
                  <span className="diagnostic-history-secondary diagnostic-mono">
                    {item.route.endpoint}
                  </span>
                )}
              </td>
              <td>
                <span>{countryLabel(item.country)}</span>
                {item.org && (
                  <span className="diagnostic-history-secondary">
                    {item.org}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
