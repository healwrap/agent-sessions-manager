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
  aliases?: string[];
  id: string;
  label: string;
  path: string;
  available: boolean;
  enabled: boolean;
  error?: string;
  api_version?: number;
  capabilities?: Record<string, boolean>;
  paths?: { key: string; label: string; hint: string }[];
}
export type ThemePreference = 'light' | 'dark' | 'system';
export interface Settings {
  paths: Record<string, string>;
  enabled: Record<string, boolean>;
  syncSeconds: number;
  animations: boolean;
  theme: ThemePreference;
}
export interface Preferences {
  pinned: string[];
  archived: string[];
  aliases: Record<string, string>;
  metadata: Record<string, Session>;
  projectAssignments: Record<string, Project>;
}
export interface Event {
  program_summary?: string;
  ref: string;
  turn: number;
  kind: string;
  record_type?: string;
  name: string;
  preview: string;
  status: string;
  timestamp: string;
  position: number;
  phase?: string | null;
  step?: number | null;
  request_number?: number;
  request_only?: boolean;
  layer?: string | null;
  output_preview?: string;
  completed_at?: string | null;
  first_token_at?: string | null;
  model?: string | null;
  model_provider?: string | null;
  usage?: Record<string, number>;
  request_cumulative_usage?: Record<string, number>;
  turn_status?: string;
  duration_ms: number | null;
  timeline_start?: number;
  timeline_end?: number;
  call_group?: string;
  call_summary?: string;
  parent_ref?: string;
  line?: number | null;
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
  capabilities?: Record<string, boolean>;
  id: string;
  provider: string;
  provider_label: string;
  instance_id: string;
  title: string;
  events: Event[];
  total: number;
  event_count: number;
  step_count?: number | null;
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
export interface Attachment {
  index: number;
  attachmentId: string;
  mediaType: string;
  bytes: number;
  name?: string;
}
export interface SourceBlock {
  type: string;
  content: string;
  ref?: string | null;
  attachment?: Omit<Attachment, 'index'>;
}
export interface CodeProgram {
  raw_input: string;
  source: string;
  description: string;
  arguments: Record<string, unknown>;
  language?: 'typescript' | 'python';
}
export interface Detail {
  code_program?: CodeProgram;
  part?: string;
  message_source?: unknown;
  prompt_snapshot?: PromptSnapshot;
  previous_prompt_snapshot?: PromptSnapshot;
  attachments?: Attachment[];
  source_blocks?: SourceBlock[];
  tool_schema?: { name: string; description?: string; parameters: unknown };
  request_config?: Record<string, unknown>;
  thinking_text?: string;
  output_text?: string;
  tool_calls?: { ref: string | null; name: string; preview: string }[];
  retries?: Record<string, unknown>[];
  request_tool_calls?: number;
  request_subtool_calls?: number;
  request_result_ref?: string | null;
  request_error?: string | null;
  request_error_code?: string | null;
  request_retry?: number | null;
  request_max_retries?: number | null;
  request_retry_delay_ms?: number | null;
  hierarchy_parent_ref?: string | null;
  event: Event;
  text: string;
  page: number;
  pages: number;
  total_chars: number;
  output_available: boolean;
  source: string;
  line: number | null;
  source_key?: string;
  thread_id: string;
  provider_label: string;
  parent_ref?: string;
  parent_output_available?: boolean;
  nested: Event[];
  input_truncated?: boolean;
}
export interface PromptSnapshot {
  system: string;
  tools: { name: string; description?: string; parameters?: unknown }[] | null;
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
  'claude:local': 'Claude Code',
  'cursor:desktop': 'Cursor',
  'dsh:local': 'DeepSeek Harness',
  'antigravity:desktop': 'Antigravity',
  'antigravity:cli': 'Antigravity CLI',
};
export const kindLabels: Record<string, [string, string]> = {
  user: ['用户', 'user'],
  assistant: ['助手', 'assistantVioletBright'],
  tool: ['工具', 'toolAmber'],
  subtool: ['子工具', 'subtoolAmber'],
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
      core?: {
        invoke: <T>(
          command: string,
          args?: Record<string, unknown>,
        ) => Promise<T>;
      };
      clipboardManager?: { writeText: (text: string) => Promise<void> };
    };
  }
}
