import type {
  Event,
  Session,
  Preferences,
  Project,
  Trajectory,
  Source,
} from './types';
export function chatReplyRefs(events: Event[], hasMore = false) {
  const replies = new Set<string>(),
    finals = new Set<number>(),
    legacy = new Map<number, Event>();
  for (const event of events) {
    if (event.kind !== 'assistant' || event.request_only) continue;
    if (['final', 'final_answer'].includes(event.phase || '')) {
      replies.add(event.ref);
      finals.add(event.turn);
    } else if (
      (!event.phase || event.phase === 'unknown') &&
      event.preview.trim() !== '<EXTERNAL SESSION IMPORTED>'
    )
      legacy.set(event.turn, event);
  }
  for (const [turn, event] of legacy)
    if (
      !finals.has(turn) &&
      event.turn_status !== 'in_progress' &&
      !(hasMore && turn === events.at(-1)?.turn)
    )
      replies.add(event.ref);
  return replies;
}
export function sourceId(item: Session, sources: Source[] = []) {
  const source = item.source_id || item.id.split(':').slice(0, 2).join(':');
  return (
    sources.find(
      (entry) => entry.id === source || entry.aliases?.includes(source),
    )?.id || source
  );
}
export function sessionTitle(item: Session, p: Preferences) {
  return p.aliases[item.id] || item.title || '(无标题)';
}
export function projectGroups(
  sessions: Session[],
  projects: Project[],
  p: Preferences,
  provider: string,
  query: string,
  archive: boolean,
  sources: Source[] = [],
) {
  const known = new Map(sessions.map((s) => [s.id, s]));
  for (const item of Object.values(p.metadata))
    if (!known.has(item.id)) known.set(item.id, item);
  const groups = new Map(
    (archive ? [] : projects).map((g) => [
      g.project_id,
      { ...g, items: [] as Session[] },
    ]),
  );
  for (const item of known.values()) {
    if (
      (provider &&
        sourceId(item, sources) !== provider &&
        item.provider !== provider) ||
      p.archived.includes(item.id) !== archive ||
      (query &&
        item.search_query !== query &&
        !`${sessionTitle(item, p)} ${item.project_label}`
          .toLowerCase()
          .includes(query.toLowerCase()))
    )
      continue;
    const key = item.project_id || 'projectless';
    if (!groups.has(key))
      groups.set(key, {
        ...item,
        project_id: key,
        project_label: item.project_label || '未分配项目',
        count: 0,
        items: [],
      });
    groups.get(key)!.items.push(item);
  }
  for (const group of groups.values()) {
    group.items.sort(
      (a, b) =>
        Number(p.pinned.includes(b.id)) - Number(p.pinned.includes(a.id)) ||
        b.updated_at.localeCompare(a.updated_at),
    );
    const archived = Array.from(known.values()).filter(
      (item) =>
        item.project_id === group.project_id && p.archived.includes(item.id),
    ).length;
    group.count = archive
      ? group.items.length
      : Math.max(group.items.length, group.count - archived);
  }
  return Array.from(groups.values());
}
export interface SummaryRow {
  ref: string;
  kind: 'summary';
  turn: number;
  preview: string;
  summaryType: 'turn' | 'call';
  group?: string;
}
export function trajectoryRows(
  events: Event[],
  data: Trajectory | null,
  query: string,
  foldTurns: boolean,
  collapsed: Set<number>,
  foldCalls: boolean,
  expanded: Set<string>,
): (Event | SummaryRow)[] {
  if (query) return events;
  const rows: (Event | SummaryRow)[] = [],
    turns = new Set<number>(),
    calls = new Set<string>();
  for (const e of events) {
    const turn = data?.turn_summaries[e.turn];
    if (foldTurns !== collapsed.has(e.turn)) {
      if (turns.has(e.turn)) continue;
      if (turn && e.position < turn.anchor_position) {
        rows.push(e);
        continue;
      }
      rows.push(e);
      turns.add(e.turn);
      if (turn?.remaining)
        rows.push({
          ref: 'summary:turn:' + e.turn,
          turn: e.turn,
          kind: 'summary',
          preview: `${turn.steps} 个步骤 · ${turn.calls} 个工具调用`,
          summaryType: 'turn',
        });
      continue;
    }
    const key = e.call_group || e.call_summary,
      group = key && data?.call_groups[key];
    if (group && foldCalls !== expanded.has(key!)) {
      if (e.kind === 'assistant') rows.push(e);
      if (!calls.has(key!)) {
        rows.push({
          ref: 'summary:call:' + key,
          turn: e.turn,
          kind: 'summary',
          preview: `${group.count} 个工具调用 · ${group.names.join(', ')}`,
          summaryType: 'call',
          group: key,
        });
        calls.add(key!);
      }
      continue;
    }
    rows.push(e);
  }
  return rows;
}
export const positionOf = (e: Event, total: number, duration: boolean) =>
  duration && Number.isFinite(e.timeline_start)
    ? e.timeline_start!
    : e.position / Math.max(1, total);
export function relativeDate(raw: string) {
  const hours = Math.floor((Date.now() - Date.parse(raw)) / 3600000);
  return !Number.isFinite(hours)
    ? ''
    : hours < 1
      ? '刚刚'
      : hours < 24
        ? hours + '小时'
        : Math.floor(hours / 24) + '天';
}
export function requestText(text: string) {
  const agent = text.match(/^\s*<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
  if (agent) return { text: agent[1].trim(), wrapped: true };
  const marker = '## My request:';
  if (
    /^\s*(<in-app-browser-context\b|# Files mentioned by the user:)/.test(
      text,
    ) &&
    text.includes(marker)
  )
    return {
      text: text.slice(text.indexOf(marker) + marker.length).trim(),
      wrapped: true,
    };
  return { text, wrapped: false };
}
