import type {
  Event,
  Trajectory,
  Preferences,
  Session,
  Project,
  Source,
  Settings,
} from '../lib/types';
export interface View {
  events: Event[];
  data: Trajectory | null;
  offset: number;
  next: number | null;
  query: string;
  selected: string | null;
  detailsOpen: boolean;
  version: string | null;
  loading: boolean;
  range: [number, number] | null;
  viewport: [number, number] | null;
  navigation: { ref: string; block: 'start' | 'center'; nonce: number } | null;
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
  version: null,
  loading: false,
  range: null,
  viewport: null,
  navigation: null,
  change: 'reset',
});
export const emptyPreferences = (): Preferences => ({
  pinned: [],
  archived: [],
  aliases: {},
  metadata: {},
  projectAssignments: {},
});
export interface AppState {
  initializing: boolean;
  catalogueLoading: boolean;
  id: string | null;
  mode: 'trace' | 'chat';
  provider: string;
  query: string;
  archive: boolean;
  sidebarClosed: boolean;
  searchOpen: boolean;
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
  toast: string;
  error: string;
  foldTurns: boolean;
  foldCalls: boolean;
  duration: boolean;
  collapsed: Set<number>;
  expandedCalls: Set<string>;
  detailWidth: number;
}
export const initialState = (): AppState => ({
  initializing: true,
  catalogueLoading: false,
  id: null,
  mode: 'trace',
  provider: '',
  query: '',
  archive: false,
  sidebarClosed: false,
  searchOpen: false,
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
  settings: { paths: {}, enabled: {}, syncSeconds: 3, animations: true },
  settingsOpen: false,
  toast: '',
  error: '',
  foldTurns: false,
  foldCalls: false,
  duration: false,
  collapsed: new Set(),
  expandedCalls: new Set(),
  detailWidth: 400,
});
