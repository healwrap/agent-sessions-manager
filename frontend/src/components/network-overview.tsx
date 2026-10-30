import { Activity, Network } from 'lucide-react';
import { ResourceLink } from './resource-link';
import type { ClaudeReport } from '../lib/claude-diagnostics';
import {
  DiagnosticBadge,
  DiagnosticCard,
  DiagnosticField,
} from './diagnostic-card';
import { DnsResolvers } from './dns-resolvers';

export function NetworkOverview({ report }: { report: ClaudeReport }) {
  const connections = report.checks.filter((item) =>
    ['claude-web', 'anthropic-api'].includes(item.id),
  );
  const ipv6 = report.checks.find((item) => item.id === 'ipv6');
  const dns = report.local_checks.find((item) => item.id === 'dns-config');
  return (
    <div className="diagnostic-card-grid diagnostic-overview-grid">
      <DiagnosticCard title="Claude 连通性" icon={<Activity size={17} />}>
        <dl className="diagnostic-fields">
          {connections.map((item) => (
            <DiagnosticField
              key={item.id}
              label={item.id === 'claude-web' ? 'Claude 网页' : 'Anthropic API'}
            >
              <DiagnosticBadge state={item.state}>
                {item.label ||
                  (item.state === 'pass'
                    ? '已到达'
                    : item.state === 'fail'
                      ? '连接失败'
                      : item.state === 'info'
                        ? '信息'
                        : '需关注')}
              </DiagnosticBadge>
              <small>{item.value}</small>
              {item.label === '需浏览器验证' && (
                <ResourceLink href="https://claude.ai/">
                  打开 Claude 网页
                </ResourceLink>
              )}
            </DiagnosticField>
          ))}
          <DiagnosticField label="IPv6 出口">
            <span data-tooltip={ipv6?.detail}>{ipv6?.value || '未取得'}</span>
          </DiagnosticField>
        </dl>
      </DiagnosticCard>
      <DiagnosticCard
        title="DNS 公网出口"
        icon={<Network size={17} />}
        extra={
          <DiagnosticBadge
            state={report.dns?.state === 'observed' ? 'info' : 'unknown'}
          >
            {report.dns?.state === 'observed' ? '已采样' : '未取得'}
          </DiagnosticBadge>
        }
      >
        <dl className="diagnostic-fields">
          <DiagnosticField label="本机解析器">
            <span className="diagnostic-mono">{dns?.value || '未取得'}</span>
          </DiagnosticField>
          <DiagnosticField label="公网解析器">
            {report.dns?.servers.length ? (
              <DnsResolvers servers={report.dns.servers} />
            ) : (
              '未取得'
            )}
          </DiagnosticField>
          {!!report.dns?.errors.length && (
            <DiagnosticField label="探针结果">
              {report.dns.errors.join('；')}
            </DiagnosticField>
          )}
        </dl>
      </DiagnosticCard>
    </div>
  );
}
