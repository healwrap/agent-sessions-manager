import type {
  Event,
  Trajectory,
  Preferences,
  Session,
  Project,
  Source,
  Settings,
  ThemePreference,
} from '../lib/types';
import type { SearchMode } from '../lib/search';
export interface View {
  events: Event[];
  data: Trajectory | null;
  offset: number;
  next: number | null;
  query: string;
  selected: string | null;
  detailsOpen: boolean;
  requestOpen: boolean;
  summaryNonce: number;
  version: string | null;
  loading: boolean;
  loadingEdge: 'before' | 'after' | null;
  range: [number, number] | null;
  viewport: [number, number] | null;
  navigation: {
    ref: string;
    block: 'start' | 'center';
    nonce: number;
    paged?: boolean;
  } | null;
  change: 'reset' | 'before' | 'after' | 'refresh';
}
export const emptyView = (): View => ({
  events: [],
  data: null,
  offset: 0,
  next: null,
  query: '',
  selected: null,
  detailsOpen: false,
  requestOpen: false,
  summaryNonce: 0,
  version: null,
  loading: false,
  loadingEdge: null,
  range: null,
  viewport: null,
  navigation: null,
  change: 'reset',
});
export const emptyPreferences = (): Preferences => ({
  showSubagents: true,
  pinned: [],
  archived: [],
  aliases: {},
  metadata: {},
  projectAssignments: {},
});
export interface ToastOptions {
  tone?: 'info' | 'success' | 'warning' | 'error';
  holdMs?: number;
  action?: { label: string; onClick: () => void };
}
export interface AppState {
  initializing: boolean;
  catalogueLoading: boolean;
  id: string | null;
  mode: 'trace' | 'chat';
  provider: string;
  query: string;
  sidebarClosed: boolean;
  searchOpen: boolean;
  searchMode: SearchMode;
  searchFocus: number;
  searchIndex: {
    pending: number;
    indexed: number;
    total: number;
    failed: number;
  } | null;
  sessions: Session[];
  projects: Project[];
  sources: Source[];
  projectOpen: Set<string>;
  projectClosed: Set<string>;
  projectExpanded: Set<string>;
  projectPages: Record<string, number | null>;
  projectLoading: Set<string>;
  views: Record<'trace' | 'chat', View>;
  preferences: Preferences;
  settings: Settings;
  settingsOpen: boolean;
  themePreview: ThemePreference | null;
  toast: string;
  toastSequence: number;
  toastOptions: ToastOptions;
  error: string;
  foldTurns: boolean;
  foldCalls: boolean;
  duration: boolean;
  collapsed: Set<number>;
  expandedCalls: Set<string>;
  detailWidth: number | null;
  toolRequestOffset: number | null;
}
export const initialState = (): AppState => ({
  initializing: true,
  catalogueLoading: false,
  id: null,
  mode: 'trace',
  provider: '',
  query: '',
  sidebarClosed: false,
  searchOpen: false,
  searchMode: 'words',
  searchFocus: 0,
  searchIndex: null,
  sessions: [],
  projects: [],
  sources: [],
  projectOpen: new Set(),
  projectClosed: new Set(),
  projectExpanded: new Set(),
  projectPages: {},
  projectLoading: new Set(),
  views: { trace: emptyView(), chat: emptyView() },
  preferences: emptyPreferences(),
  settings: {
    paths: {},
    enabled: {},
    syncSeconds: 3,
    animations: true,
    theme: 'system',
    chatDetail: 'standard',
    fontSize: 14,
  },
  settingsOpen: false,
  themePreview: null,
  toast: '',
  toastSequence: 0,
  toastOptions: {},
  error: '',
  foldTurns: false,
  foldCalls: false,
  duration: false,
  collapsed: new Set(),
  expandedCalls: new Set(),
  detailWidth: null,
  toolRequestOffset: null,
});
