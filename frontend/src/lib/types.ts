export interface Project {
  project_id: string;
  project_label: string;
  project_path: string;
  project_source?: string;
  count: number;
}
export interface Session extends Project {
  search_query?: string;
  id: string;
  title: string;
  updated_at: string;
  provider: string;
  source_id?: string;
  instance_id?: string;
  provider_label: string;
}
export interface Source {
  id: string;
  label: string;
  path: string;
  available: boolean;
  enabled: boolean;
  error?: string;
}
export interface Settings {
  paths: Record<string, string>;
  enabled: Record<string, boolean>;
  syncSeconds: number;
  animations: boolean;
}
export interface Preferences {
  pinned: string[];
  archived: string[];
  aliases: Record<string, string>;
  metadata: Record<string, Session>;
  projectAssignments: Record<string, Project>;
}
export interface Event {
  ref: string;
  turn: number;
  kind: string;
  name: string;
  preview: string;
  status: string;
  timestamp: string;
  position: number;
  phase?: string | null;
  turn_status?: string;
  duration_ms: number | null;
  timeline_start?: number;
  timeline_end?: number;
  call_group?: string;
  call_summary?: string;
  parent_ref?: string;
  line?: number;
  output_chars?: number;
  result_note?: string;
  count?: number;
  end_position?: number;
  search_match?: boolean;
}
export interface TurnSummary {
  anchor_ref: string;
  anchor_position: number;
  first_position: number;
  last_position: number;
  remaining: number;
  steps: number;
  calls: number;
}
export interface CallGroup {
  key: string;
  first_ref: string;
  last_ref: string;
  count: number;
  names: string[];
  anchor_ref: string | null;
}
export interface Trajectory {
  id: string;
  provider: string;
  provider_label: string;
  instance_id: string;
  title: string;
  events: Event[];
  total: number;
  event_count: number;
  turn_count: number;
  tool_count: number;
  next_offset: number | null;
  version: string;
  project_id: string;
  project_label: string;
  project_path: string;
  warnings: Record<string, number>;
  compactions: number;
  overview: Event[];
  active_duration_ms: number;
  turn_summaries: Record<string, TurnSummary>;
  call_groups: Record<string, CallGroup>;
  unavailable_reason?: string;
}
export interface Detail {
  event: Event;
  text: string;
  page: number;
  pages: number;
  total_chars: number;
  output_available: boolean;
  source: string;
  line: number;
  thread_id: string;
  provider_label: string;
  parent_ref?: string;
  parent_output_available?: boolean;
  nested: Event[];
  input_truncated?: boolean;
}
export interface Catalogue {
  items: Session[];
  total: number;
  next_offset: number | null;
  projects: Project[];
  current_id?: string;
  sources: Source[];
}
export interface SettingsResponse {
  value: Settings;
  defaults: Settings;
  sources: Source[];
}
export interface FocusResult {
  count: number;
  span: number;
  first: { ref: string; position: number };
  middle: { ref: string; position: number };
}
export type Request = <T>(
  path: string,
  params?: Record<string, string | number>,
  body?: unknown,
) => Promise<T>;
export const sourceNames: Record<string, string> = {
  'codex:local': 'Codex',
  'claude:local': 'Claude Code CLI',
  'claude:desktop': 'Claude Code Desktop',
  'dsh:local': 'DeepSeek Harness',
  'antigravity:desktop': 'Antigravity',
  'antigravity:cli': 'Antigravity CLI',
};
export const kindLabels: Record<string, [string, string]> = {
  user: ['用户', 'user'],
  assistant: ['助手', 'assistantVioletBright'],
  tool: ['工具', 'toolAmber'],
  subtool: ['工具', 'toolAmber'],
  media: ['上下文', 'contextGreen'],
  context: ['上下文', 'contextGreen'],
};
export const statusLabels: Record<string, string> = {
  completed: '已完成',
  in_progress: '进行中',
  aborted: '已中止',
  error: '失败',
  pending: '等待结果',
  running: '运行中',
  result: '已返回',
  unread: '未读取',
  unmatched: '结果另列',
  metadata: '已记录',
};
declare global {
  interface Window {
    agentSessionsDesktop?: boolean;
    agentSessionsPaused?: boolean;
    agentSessionsWindowVisible?: boolean;
    loadTrace?: () => void;
    loadSessions?: () => void;
    __TAURI__?: {
      core?: { invoke: <T>(command: string) => Promise<T> };
      clipboardManager?: { writeText: (text: string) => Promise<void> };
    };
  }
}
