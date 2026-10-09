import {
  initialState,
  emptyView,
  emptyPreferences,
  type AppState,
  type View,
} from './model';
import { createTraceLoader } from './trace-loader';
import { createNavigation, updateAddress } from './navigation';
import { request } from '../lib/api';
import type { SearchMode } from '../lib/search';
import type {
  Catalogue,
  Preferences,
  Request,
  Settings,
  SettingsResponse,
  Source,
} from '../lib/types';
export type { AppState, View } from './model';
export class SessionStore {
  private trace = createTraceLoader(this);
  private navigation = createNavigation(this);
  loadTrace = this.trace.loadTrace;
  selectEvent = this.navigation.selectEvent;
  clearSelection = this.navigation.clearSelection;
  cancelFocus = this.navigation.cancelFocus;
  focusRange = this.navigation.focusRange;
  private listeners = new Set<() => void>();
  private sessionsGeneration = 0;
  private preferenceSave = Promise.resolve();
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private scrollPositions = { trace: 0, chat: 0 };
  state: AppState = initialState();
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
      // Start independent catalogue and settings reads together while showing
      // the pre-rendered shell. Attach a rejection handler immediately.
      const catalogue = this.api<Catalogue>('/api/sessions');
      void catalogue.catch(() => {});
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
      await this.loadSessions(true, catalogue);
    } catch (error) {
      this.update({ error: String(error) });
      this.notify(String(error));
    } finally {
      this.update({ initializing: false });
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
  async loadSessions(preserve = true, pending?: Promise<Catalogue>) {
    const generation = ++this.sessionsGeneration;
    const { query, provider, searchMode } = this.state;
    if (this.state.initializing || !preserve)
      this.update({ catalogueLoading: true });
    try {
      const subagents = this.state.preferences.showSubagents !== false;
      const data = await ((pending && !query && !provider && subagents
        ? pending
        : null) ||
        this.api<Catalogue>('/api/sessions', {
          q: query,
          provider,
          search_mode: searchMode,
          subagents: subagents ? 1 : 0,
        }));
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
        searchIndex: data.search_index || null,
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
    } finally {
      if (generation === this.sessionsGeneration)
        this.update({ catalogueLoading: false });
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
        search_mode: this.state.searchMode,
        subagents: this.state.preferences.showSubagents !== false ? 1 : 0,
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
      if (generation === this.sessionsGeneration) {
        const loading = new Set(this.state.projectLoading);
        loading.delete(key);
        this.update({ projectLoading: loading });
      }
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
  async filter(
    provider: string,
    query: string,
    searchMode: SearchMode = this.state.searchMode,
  ) {
    this.update({
      provider,
      query: query.trim(),
      searchMode,
      searchIndex: null,
      projectPages: {},
      projectLoading: new Set(),
      projectExpanded: new Set(),
    });
    await this.loadSessions(false);
  }
  async setShowSubagents(showSubagents: boolean) {
    const saved = this.savePreferences({
      ...this.state.preferences,
      showSubagents,
    });
    await this.filter(this.state.provider, this.state.query);
    await saved;
  }
  async selectSession(id: string, ref: string | null = null) {
    this.scrollPositions = { trace: 0, chat: 0 };
    this.trace.invalidate();
    this.navigation.invalidate();
    this.update({
      id,
      error: '',
      views: { trace: emptyView(), chat: emptyView() },
      collapsed: new Set(),
      expandedCalls: new Set(),
    });
    updateAddress(this);
    await this.loadTrace(true);
    if (ref) await this.selectEvent(ref, true);
  }

  switchMode(mode: 'chat' | 'trace') {
    if (mode === this.state.mode) return;
    this.cancelFocus();
    this.update({ mode });
    void this.loadTrace(!this.state.views[mode].data);
  }
  async searchTrace(query: string) {
    this.cancelFocus();
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
  toggleCall(group: string) {
    const expandedCalls = new Set(this.state.expandedCalls);
    if (expandedCalls.has(group)) expandedCalls.delete(group);
    else expandedCalls.add(group);
    this.update({ expandedCalls });
  }

  toggleTurn(turn: number) {
    const collapsed = new Set(this.state.collapsed);
    if (collapsed.has(turn)) collapsed.delete(turn);
    else collapsed.add(turn);
    this.update({ collapsed });
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
      themePreview: null,
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
}
export const sessionStore = new SessionStore();
