export type UpdateStage =
  | 'idle'
  | 'checking'
  | 'available'
  | 'current'
  | 'unpublished'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'error';
export interface AppUpdateView {
  state: UpdateStage;
  current_version: string;
  new_version: string;
  notes: string;
  downloaded: number;
  total: number | null;
  error: string;
}
export interface AppUpdateClient {
  readonly supported: boolean;
  command: (
    action: 'status' | 'check' | 'download' | 'install',
  ) => Promise<AppUpdateView>;
}
export const desktopUpdates: AppUpdateClient = {
  get supported() {
    return typeof window !== 'undefined' && !!window.__TAURI__?.core;
  },
  command(action) {
    const invoke = window.__TAURI__?.core?.invoke;
    return invoke
      ? invoke<AppUpdateView>('app_update_' + action)
      : Promise.reject(new Error('请在桌面应用中检查更新'));
  },
};
