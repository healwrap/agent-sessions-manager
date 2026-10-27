export type SkillState =
  | 'ready'
  | 'outdated'
  | 'missing'
  | 'broken'
  | 'unconfigured'
  | 'modified'
  | 'shared'
  | 'error'
  | 'external';
export type SkillAction =
  'install' | 'update' | 'repair' | 'remove' | 'configure';
export interface SkillTarget {
  id: string;
  name: string;
  client: string;
  state: SkillState;
  path: string;
  method: 'link' | 'copy';
  note: string;
  source?: string;
  exists: boolean;
  managed: boolean;
  version?: string;
  resolved_path?: string;
  effective_path?: string;
  shared_with: string[];
  modified_files: string[];
}
export interface SkillRecord {
  id: string;
  target_id: string;
  name: string;
  action: SkillAction;
  checked_at: string;
  path: string;
  success: boolean;
  message: string;
  backup: string;
  can_restore: boolean;
  restored: boolean;
}
export interface SkillInventory {
  source: {
    name: string;
    id: string;
    version: string;
    path: string;
    document: string;
    source: string;
  };
  targets: SkillTarget[];
  records: SkillRecord[];
  checked_at: string;
  results?: SkillRecord[];
}
export interface SkillPlan {
  token: string;
  action: SkillAction;
  method: 'link' | 'copy';
  version: string;
  items: {
    id: string;
    name: string;
    path: string;
    backup: boolean;
    affects: string[];
    modified_files: string[];
  }[];
}
export const skillStates = {
  ready: { label: '已安装', tone: 'success', detail: '安装文件可读取' },
  outdated: {
    label: '可更新',
    tone: 'warning',
    detail: '安装版本与应用提供版本不同',
  },
  missing: { label: '未安装', tone: 'neutral', detail: '专用安装入口尚不存在' },
  broken: {
    label: '链接异常',
    tone: 'error',
    detail: '安装入口存在，目标已失效',
  },
  unconfigured: {
    label: '待配置',
    tone: 'neutral',
    detail: '需要确认当前客户端的 Skill 入口',
  },
  modified: {
    label: '内容待核对',
    tone: 'warning',
    detail: '已有安装内容或版本清单不同',
  },
  shared: {
    label: '共享可用',
    tone: 'success',
    detail: '通过共享目录读取，尚无专用安装',
  },
  external: {
    label: '外部安装',
    tone: 'neutral',
    detail: '文件可读取，版本未登记',
  },
  error: {
    label: '检测失败',
    tone: 'error',
    detail: '未能完成此入口的文件检测',
  },
} as const;
export const skillActions: Record<SkillAction, string> = {
  install: '安装',
  update: '更新',
  repair: '修复链接',
  remove: '卸载',
  configure: '配置入口',
};
export function suggestedAction(target: SkillTarget): SkillAction {
  return {
    ready: 'update',
    outdated: 'update',
    missing: 'install',
    broken: 'repair',
    unconfigured: 'configure',
    modified: 'update',
    shared: 'install',
    error: 'configure',
    external: 'update',
  }[target.state] as SkillAction;
}
export function installedTarget(target: SkillTarget) {
  return target.exists;
}
