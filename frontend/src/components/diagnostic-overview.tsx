import { Activity, Network, Radio } from 'lucide-react';
import type { ClaudeReport, DiagnosticItem } from '../lib/claude-diagnostics';
import {
  DiagnosticBadge,
  DiagnosticCard,
  DiagnosticField,
} from './diagnostic-card';

export function DiagnosticOverview({
  report,
  windowChecks,
}: {
  report: ClaudeReport;
  windowChecks: DiagnosticItem[];
}) {
  const connections = report.checks.filter((item) =>
    ['claude-web', 'anthropic-api'].includes(item.id),
  );
  const ipv6 = report.checks.find((item) => item.id === 'ipv6');
  const dns = report.local_checks.find((item) => item.id === 'dns-config');
  const desktop = report.checks.find((item) => item.id === 'desktop-transport');
  const rtc = windowChecks.find((item) => item.id === 'webrtc');
  const candidates =
    rtc?.value.split('；').filter((value) => value.includes(' · ')) || [];
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
          <DiagnosticField label="官方 App 链路">
            <DiagnosticBadge state={desktop?.state}>
              {desktop?.value || '尚未验证'}
            </DiagnosticBadge>
          </DiagnosticField>
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
      <DiagnosticCard
        title="WebRTC / UDP"
        icon={<Radio size={17} />}
        extra={<DiagnosticBadge state="info">当前窗口</DiagnosticBadge>}
      >
        <dl className="diagnostic-fields">
          <DiagnosticField label="候选采样">
            <DiagnosticBadge state={candidates.length ? 'info' : 'unknown'}>
              {candidates.length ? '已取得地址' : '未取得地址'}
            </DiagnosticBadge>
          </DiagnosticField>
          <DiagnosticField label="泄漏判定">
            <DiagnosticBadge>尚未验证</DiagnosticBadge>
          </DiagnosticField>
          {candidates.length ? (
            candidates.map((candidate) => {
              const [type, ...address] = candidate.split(' · ');
              return (
                <DiagnosticField
                  key={candidate}
                  label={
                    type === 'srflx'
                      ? '公网候选'
                      : type === 'host'
                        ? '本地候选'
                        : `${type} 候选`
                  }
                >
                  <span className="diagnostic-mono">{address.join(' · ')}</span>
                </DiagnosticField>
              );
            })
          ) : (
            <DiagnosticField label="采样结果">
              {rtc?.value || '未完成采样'}
            </DiagnosticField>
          )}
        </dl>
        <p className="diagnostic-card-footnote">
          {rtc?.detail || '采样来源为当前 Agent Sessions 窗口。'}
        </p>
      </DiagnosticCard>
    </div>
  );
}
