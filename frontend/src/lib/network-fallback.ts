import type { ProxyConfig } from './environment-settings';

export function fallbackChain(lines: ProxyConfig[], root: string) {
  const seen = new Set<string>();
  const result: ProxyConfig[] = [];
  const visit = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    const line = lines.find((row) => row.id === key);
    if (!line) return;
    result.push(line);
    for (const id of line.fallback_ids || []) visit(id);
  };
  visit(root);
  return result;
}
