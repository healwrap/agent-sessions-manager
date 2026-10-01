import { request } from '../lib/api';
import type {
  Catalogue,
  Detail,
  Event,
  FocusResult,
  Preferences,
  Project,
  Request,
  Session,
  Settings,
  SettingsResponse,
  Source,
  Trajectory,
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
const emptyView = (): View => ({
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
const emptyPreferences = (): Preferences => ({
  pinned: [],
  archived: [],
  aliases: {},
  metadata: {},
  projectAssignments: {},
});
export interface AppState {
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
  info: { title: string; text: string } | null;
  toast: string;
  error: string;
  foldTurns: boolean;
  foldCalls: boolean;
  duration: boolean;
  collapsed: Set<number>;
  expandedCalls: Set<string>;
  detailWidth: number;
}
export class SessionStore {
  private listeners = new Set<() => void>();
  private sessionsGeneration = 0;
  private generations = { trace: 0, chat: 0 };
  private focusGeneration = 0;
  private selectionGeneration = 0;
  private preferenceSave = Promise.resolve();
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private scrollPositions = { trace: 0, chat: 0 };
  private refreshing = new Set<'trace' | 'chat'>();
  state: AppState = {
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
    info: null,
    toast: '',
    error: '',
    foldTurns: false,
    foldCalls: false,
    duration: false,
    collapsed: new Set(),
    expandedCalls: new Set(),
    detailWidth: 400,
  };
  constructor(readonly api: Request = request) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  get view() {
    return this.state.views[this.state.mode];
  }
  rememberScroll(mode: 'trace' | 'chat', top: number) {
    this.scrollPositions[mode] = top;
  }
  scrollPosition(mode: 'trace' | 'chat') {
    return this.scrollPositions[mode];
  }
  update(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  updateView(patch: Partial<View>, mode = this.state.mode) {
    this.update({
      views: {
        ...this.state.views,
        [mode]: { ...this.state.views[mode], ...patch },
      },
    });
  }
  notify(message: string) {
    clearTimeout(this.toastTimer);
    this.update({ toast: message });
    this.toastTimer = setTimeout(() => this.update({ toast: '' }), 3500);
  }
  private address(ref?: string) {
    if (typeof history !== 'undefined' && this.state.id)
      history.replaceState(
        null,
        '',
        '?' +
          new URLSearchParams({ id: this.state.id, ...(ref ? { ref } : {}) }),
      );
  }
  async initialize() {
    try {
      let legacy: Partial<Preferences> = {};
      try {
        legacy = JSON.parse(
          localStorage.getItem('agent-sessions-view') ||
            localStorage.getItem('codex-context-view') ||
            '{}',
        );
      } catch {}
      const [preferences, settings] = await Promise.all([
        this.api<{ saved: boolean; value: Preferences }>('/api/preferences'),
        this.api<SettingsResponse>('/api/settings'),
      ]);
      const p = {
        ...emptyPreferences(),
        ...(preferences.saved ? preferences.value : legacy),
      };
      const qualify = (id: string) =>
        /^[0-9a-f-]{36}$/i.test(id) ? 'codex:local:' + id : id;
      p.pinned = p.pinned.map(qualify);
      p.archived = p.archived.map(qualify);
      p.aliases = Object.fromEntries(
        Object.entries(p.aliases).map(([id, value]) => [qualify(id), value]),
      );
      p.metadata = Object.fromEntries(
        Object.entries(p.metadata).map(([id, item]) => [
          qualify(id),
          { ...item, id: qualify(id) },
        ]),
      );
      this.update({ preferences: p, settings: settings.value });
      await this.loadSessions();
    } catch (error) {
      this.update({ error: String(error) });
      this.notify(String(error));
    }
  }
  async savePreferences(next: Preferences) {
    this.update({ preferences: next });
    try {
      localStorage.setItem('agent-sessions-view', JSON.stringify(next));
    } catch {}
    this.preferenceSave = this.preferenceSave
      .catch(() => {})
      .then(async () => {
        await this.api('/api/preferences', {}, next);
      })
      .catch((error) => this.notify(String(error)));
    await this.preferenceSave;
  }
  async loadSessions(preserve = true) {
    const generation = ++this.sessionsGeneration;
    const { query, provider } = this.state;
    try {
      const data = await this.api<Catalogue>('/api/sessions', {
        q: query,
        provider,
      });
      if (generation !== this.sessionsGeneration) return;
      const known = new Map(
        (preserve && !query ? this.state.sessions : []).map((item) => [
          item.id,
          item,
        ]),
      );
      for (const item of data.items) known.set(item.id, item);
      this.update({
        sessions: Array.from(known.values()),
        projects: data.projects,
        sources: data.sources,
        projectPages: preserve ? this.state.projectPages : {},
      });
      if (!this.state.id) {
        const params =
          typeof location === 'undefined'
            ? new URLSearchParams()
            : new URLSearchParams(location.search);
        const id =
          params.get('id') ||
          (data.current_id &&
            data.items.find((s) => s.id === data.current_id)?.id) ||
          data.items[0]?.id;
        if (id) await this.selectSession(id, params.get('ref'));
      }
    } catch (error) {
      this.notify(String(error));
    }
  }
  async loadProject(key: string) {
    if (
      this.state.projectLoading.has(key) ||
      this.state.projectPages[key] === null
    )
      return;
    const generation = this.sessionsGeneration;
    this.update({
      projectLoading: new Set(this.state.projectLoading).add(key),
    });
    try {
      const data = await this.api<Catalogue>('/api/sessions', {
        project: key,
        provider: this.state.provider,
        q: this.state.query,
        offset: this.state.projectPages[key] || 0,
        limit: 100,
      });
      if (generation !== this.sessionsGeneration) return;
      const known = new Map(this.state.sessions.map((s) => [s.id, s]));
      for (const item of data.items) known.set(item.id, item);
      this.update({
        sessions: Array.from(known.values()),
        projectPages: { ...this.state.projectPages, [key]: data.next_offset },
      });
    } catch (error) {
      this.notify(String(error));
    } finally {
      const loading = new Set(this.state.projectLoading);
      loading.delete(key);
      this.update({ projectLoading: loading });
    }
  }
  toggleProject(key: string, open: boolean) {
    const opened = new Set(this.state.projectOpen),
      closed = new Set(this.state.projectClosed);
    if (open) {
      opened.add(key);
      closed.delete(key);
    } else {
      opened.delete(key);
      closed.add(key);
    }
    this.update({ projectOpen: opened, projectClosed: closed });
    if (open) void this.loadProject(key);
  }
  expandProject(key: string, expand: boolean) {
    const expanded = new Set(this.state.projectExpanded);
    if (expand) expanded.add(key);
    else expanded.delete(key);
    this.update({ projectExpanded: expanded });
    if (expand) void this.loadProject(key);
  }
  async filter(provider: string, query: string) {
    this.update({
      provider,
      query,
      projectPages: {},
      projectExpanded: new Set(),
    });
    await this.loadSessions(false);
  }
  async selectSession(id: string, ref: string | null = null) {
    this.scrollPositions = { trace: 0, chat: 0 };
    this.generations.trace++;
    this.generations.chat++;
    this.focusGeneration++;
    this.selectionGeneration++;
    this.update({
      id,
      error: '',
      views: { trace: emptyView(), chat: emptyView() },
      collapsed: new Set(),
      expandedCalls: new Set(),
    });
    this.address();
    await this.loadTrace(true);
    if (ref) await this.selectEvent(ref, true);
  }
  async loadTrace(
    force = false,
    edge?: 'before' | 'after',
    offset?: number,
    current: () => boolean = () => true,
  ) {
    const { id, mode } = this.state;
    if (!id) return;
    const background = !force && !edge && !!this.state.views[mode].data;
    if (background && this.refreshing.has(mode)) return;
    if (background) this.refreshing.add(mode);
    const generation = ++this.generations[mode],
      view = this.state.views[mode],
      query = view.query;
    const valid = () =>
      generation === this.generations[mode] &&
      id === this.state.id &&
      current();
    if (!background) this.updateView({ loading: true }, mode);
    try {
      let start =
        offset ??
        (edge === 'before'
          ? Math.max(0, view.offset - 150)
          : edge === 'after'
            ? (view.next ?? 0)
            : view.offset);
      const get = (at: number, limit = 150) =>
        this.api<Trajectory>('/api/trajectory', {
          id,
          q: query,
          kind: 'all',
          offset: at,
          limit,
        });
      let first = await get(
        start,
        edge === 'before' ? view.offset - start : 150,
      );
      if (!valid()) return;
      if (!force && !edge && first.version === view.version) {
        if (this.state.error) this.update({ error: '' });
        return;
      }
      if (
        mode === 'chat' &&
        !view.events.length &&
        !query &&
        offset === undefined &&
        first.next_offset !== null
      ) {
        start = Math.max(0, first.total - 150);
        first = await get(start);
        if (!valid()) return;
      }
      let events = first.events,
        next = first.next_offset;
      // A view that already reached the live tail must keep reaching it as
      // the transcript grows, rather than stopping at its old page length.
      const refreshTail =
        mode === 'chat' && !query && offset === undefined && view.next === null;
      while (
        !edge &&
        next !== null &&
        (refreshTail || events.length < Math.max(150, view.events.length))
      ) {
        const page = await get(next);
        if (!valid()) return;
        events = events.concat(page.events);
        next = page.next_offset;
      }
      const canonical = first.id || id;
      if (canonical !== id) this.update({ id: canonical });
      this.updateView(
        {
          events:
            edge === 'before'
              ? events.concat(view.events)
              : edge === 'after'
                ? view.events.concat(events)
                : events,
          data: first,
          offset: edge === 'after' ? view.offset : start,
          next: edge === 'before' ? view.next : next,
          version: first.version,
          change: edge || 'refresh',
        },
        mode,
      );
      if (!this.state.sessions.some((item) => item.id === canonical)) {
        const item = { ...first, updated_at: '', count: 1 };
        this.update({ sessions: [...this.state.sessions, item] });
      }
      if (
        !this.state.projectClosed.has(first.project_id) &&
        !this.state.projectOpen.has(first.project_id)
      ) {
        this.update({
          projectOpen: new Set(this.state.projectOpen).add(first.project_id),
        });
        void this.loadProject(first.project_id);
      }
      if (this.state.error) this.update({ error: '' });
    } catch (error) {
      if (valid()) {
        this.update({ error: String(error) });
        this.notify(String(error));
      }
    } finally {
      if (background) this.refreshing.delete(mode);
      if (!background && generation === this.generations[mode])
        this.updateView({ loading: false }, mode);
    }
  }
  switchMode(mode: 'chat' | 'trace') {
    if (mode === this.state.mode) return;
    this.focusGeneration++;
    this.update({ mode });
    void this.loadTrace(!this.state.views[mode].data);
  }
  async searchTrace(query: string) {
    this.focusGeneration++;
    this.updateView({
      query,
      events: [],
      offset: 0,
      next: null,
      range: null,
      version: null,
    });
    await this.loadTrace(true);
  }
  toggleTurn(turn: number) {
    const collapsed = new Set(this.state.collapsed);
    if (collapsed.has(turn)) collapsed.delete(turn);
    else collapsed.add(turn);
    this.update({ collapsed });
  }
  private unfold(event: Event) {
    if (this.state.foldTurns !== this.state.collapsed.has(event.turn))
      this.toggleTurn(event.turn);
    if (['tool', 'subtool'].includes(event.kind) && this.state.foldCalls)
      this.update({ foldCalls: false });
  }
  async selectEvent(ref: string, jump = false) {
    const id = this.state.id;
    if (!id) return;
    const token = ++this.selectionGeneration;
    const current = () =>
      id === this.state.id && token === this.selectionGeneration;
    this.focusGeneration++;
    this.switchMode('trace');
    try {
      const detail = await this.api<Detail>('/api/event', { id, ref });
      if (!current()) return;
      const canonical = detail.event.ref || ref;
      this.updateView({ selected: canonical, detailsOpen: true });
      this.address(canonical);
      if (jump) {
        if (!this.view.events.some((e) => e.ref === canonical)) {
          this.updateView({ query: '', events: [] });
          await this.loadTrace(
            true,
            undefined,
            Math.floor(detail.event.position / 150) * 150,
            current,
          );
          if (!current()) return;
        }
        const event = this.view.events.find((e) => e.ref === canonical);
        if (event) this.unfold(event);
        this.updateView({
          navigation: { ref: canonical, block: 'center', nonce: Date.now() },
        });
      }
    } catch (error) {
      this.notify(String(error));
    }
  }
  cancelFocus() {
    this.focusGeneration++;
  }
  async focusRange(range: [number, number], height: number) {
    this.updateView({ range });
    const token = ++this.focusGeneration,
      id = this.state.id,
      duration = this.state.duration;
    const current = () =>
      token === this.focusGeneration &&
      id === this.state.id &&
      this.state.mode === 'trace';
    if (!id) return;
    try {
      const data = await this.api<FocusResult>('/api/trajectory-focus', {
        id,
        start: range[0],
        end: range[1],
        mode: duration ? 'duration' : 'position',
      });
      if (!current()) return;
      if (!data.count) {
        this.notify('圈选范围内没有记录。');
        return;
      }
      const tall = data.span * 32 > height,
        target = tall ? data.first : data.middle;
      if (
        this.view.query ||
        !this.view.events.some((e) => e.ref === target.ref)
      ) {
        this.updateView({ query: '', events: [] });
        await this.loadTrace(
          true,
          undefined,
          Math.floor(target.position / 150) * 150,
          current,
        );
        if (!current()) return;
      }
      const event = this.view.events.find((e) => e.ref === target.ref);
      if (!event) return;
      this.unfold(event);
      this.updateView({
        navigation: {
          ref: target.ref,
          block: tall ? 'start' : 'center',
          nonce: Date.now(),
        },
      });
    } catch (error) {
      if (current()) this.notify(String(error));
    }
  }
  async saveSettings(value: Settings) {
    const data = await this.api<{ value: Settings; sources: Source[] }>(
      '/api/settings',
      {},
      value,
    );
    const changed =
      JSON.stringify(value.paths) !==
        JSON.stringify(this.state.settings.paths) ||
      JSON.stringify(value.enabled) !==
        JSON.stringify(this.state.settings.enabled);
    this.update({
      settings: data.value,
      sources: data.sources,
      settingsOpen: false,
    });
    if (changed) {
      this.update({
        id: null,
        views: { trace: emptyView(), chat: emptyView() },
      });
      if (typeof history !== 'undefined') history.replaceState(null, '', '/');
    }
    await this.loadSessions(false);
    this.notify('设置已保存。');
  }
  async togglePreference(item: Session, field: 'pinned' | 'archived') {
    const p = this.state.preferences,
      list = p[field].includes(item.id)
        ? p[field].filter((id) => id !== item.id)
        : [...p[field], item.id];
    await this.savePreferences({
      ...p,
      [field]: list,
      metadata: { ...p.metadata, [item.id]: item },
    });
  }
  async rename(item: Session, title: string) {
    const p = this.state.preferences;
    await this.savePreferences({
      ...p,
      aliases: { ...p.aliases, [item.id]: title },
      metadata: { ...p.metadata, [item.id]: item },
    });
  }
  async moveProject(item: Session, project: Project | undefined) {
    const p = this.state.preferences,
      assignments = { ...p.projectAssignments },
      metadata = { ...p.metadata };
    if (project) assignments[item.id] = project;
    else delete assignments[item.id];
    delete metadata[item.id];
    await this.savePreferences({
      ...p,
      projectAssignments: assignments,
      metadata,
    });
    await this.loadSessions(false);
    if (item.id === this.state.id) await this.loadTrace(true);
  }
}
export const sessionStore = new SessionStore();
