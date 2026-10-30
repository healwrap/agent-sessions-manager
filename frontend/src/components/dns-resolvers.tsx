import { countryLabel } from '../lib/diagnostic-labels';
import type { DnsServer } from '../lib/leak-observation';

export function DnsResolvers({ servers }: { servers: DnsServer[] }) {
  return (
    <div
      className="diagnostic-dns-resolvers"
      role="list"
      aria-label="公网 DNS 解析器"
    >
      {servers.map((server) => (
        <div
          className="diagnostic-dns-resolver"
          role="listitem"
          key={server.ip}
        >
          <span className="diagnostic-mono">{server.ip}</span>
          <span data-tooltip={server.info[0]}>
            {countryLabel(server.country) || '地区未知'}
          </span>
          <span>
            {server.info.slice(1).join(' · ') || server.info[0] || '运营商未知'}
          </span>
        </div>
      ))}
    </div>
  );
}
