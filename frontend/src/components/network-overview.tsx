import { Activity, Network } from 'lucide-react';
import type { ClaudeReport } from '../lib/claude-diagnostics';
import {
  DiagnosticBadge,
  DiagnosticCard,
  DiagnosticField,
} from './diagnostic-card';

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
                {item.state === 'pass'
                  ? '已到达'
                  : item.state === 'fail'
                    ? '连接失败'
                    : '需关注'}
              </DiagnosticBadge>
              <small>{item.value}</small>
            </DiagnosticField>
          ))}
          <DiagnosticField label="IPv6 出口">
            <span className="diagnostic-mono">{ipv6?.value || '未取得'}</span>
          </DiagnosticField>
        </dl>
        <p className="diagnostic-card-footnote">
          后台通过所选链路采样；API 401 表示未认证请求已到达。
        </p>
      </DiagnosticCard>
      <DiagnosticCard
        title="DNS 解析检查"
        icon={<Network size={17} />}
        extra={<DiagnosticBadge>本机配置</DiagnosticBadge>}
      >
        <dl className="diagnostic-fields">
          <DiagnosticField label="公网泄漏状态">
            <DiagnosticBadge>尚未验证</DiagnosticBadge>
          </DiagnosticField>
          <DiagnosticField label="本机解析器">
            <span className="diagnostic-mono">{dns?.value || '未取得'}</span>
          </DiagnosticField>
          <DiagnosticField label="公网 DNS 出口">尚未采样</DiagnosticField>
        </dl>
        <p className="diagnostic-card-footnote">
          {report.checks.find((item) => item.id === 'dns-leak')?.detail}
        </p>
      </DiagnosticCard>
    </div>
  );
}
