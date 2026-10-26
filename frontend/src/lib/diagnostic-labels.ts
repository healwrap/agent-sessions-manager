import type { ClaudeReport, EgressSample } from './claude-diagnostics';

const countries = new Intl.DisplayNames(['zh-CN'], {
  type: 'region',
  fallback: 'none',
});
// Cloudflare colo identifiers are airport / metropolitan codes, not countries.
const nodes: Record<string, string> = {
  SIN: '新加坡',
  LAX: '洛杉矶',
  SFO: '旧金山',
  SJC: '圣何塞',
  SEA: '西雅图',
  DFW: '达拉斯',
  AUS: '奥斯汀',
  IAH: '休斯敦',
  ORD: '芝加哥',
  ATL: '亚特兰大',
  JFK: '纽约',
  EWR: '纽瓦克',
  IAD: '阿什本',
  MIA: '迈阿密',
  BOS: '波士顿',
  DEN: '丹佛',
  HKG: '香港',
  TPE: '台北',
  NRT: '东京',
  KIX: '大阪',
  ICN: '首尔',
  KUL: '吉隆坡',
  BKK: '曼谷',
  SGN: '胡志明市',
  MNL: '马尼拉',
  SYD: '悉尼',
  MEL: '墨尔本',
  AKL: '奥克兰',
  LHR: '伦敦',
  FRA: '法兰克福',
  AMS: '阿姆斯特丹',
  CDG: '巴黎',
  MAD: '马德里',
  MXP: '米兰',
  ZRH: '苏黎世',
  ARN: '斯德哥尔摩',
  YYZ: '多伦多',
  YVR: '温哥华',
  YUL: '蒙特利尔',
  DXB: '迪拜',
  BOM: '孟买',
  DEL: '新德里',
  GRU: '圣保罗',
};

export function countryLabel(code?: string): string {
  if (!code) return '';
  const region = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(region)) return `地区代码：${code}`;
  const name = countries.of(region);
  if (!name) return `地区代码：${region}`;
  const flag = String.fromCodePoint(
    ...[...region].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  );
  return `${flag} ${name}`;
}

export function exitDescription(exit: EgressSample): string {
  return [
    exit.country && `出口地区：${countryLabel(exit.country)}`,
    exit.colo &&
      `边缘节点：${nodes[exit.colo] ? `${nodes[exit.colo]}（${exit.colo}）` : exit.colo}`,
    exit.ms !== undefined && `耗时 ${exit.ms} 毫秒`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function networkChecks(report: ClaudeReport) {
  return report.checks.map((item) => {
    const sample =
      item.id === 'claude-trace'
        ? report.exits.claude
        : item.id === 'cloudflare-trace'
          ? report.exits.cloudflare
          : null;
    return sample?.ip ? { ...item, detail: exitDescription(sample) } : item;
  });
}
