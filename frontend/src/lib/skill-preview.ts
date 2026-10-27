// Interaction-design fixtures only; no agent installation directory is written.
export type SkillState =
  'ready' | 'outdated' | 'missing' | 'broken' | 'unconfigured';
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
}
export const skillStates = {
  ready: { label: '已安装', tone: 'success', detail: '与内置版本一致' },
  outdated: {
    label: '可更新',
    tone: 'warning',
    detail: '保留了较早的独立副本',
  },
  missing: {
    label: '未安装',
    tone: 'neutral',
    detail: '安装后可在新会话中使用',
  },
  broken: {
    label: '链接异常',
    tone: 'error',
    detail: '安装入口存在，目标已失效',
  },
  unconfigured: {
    label: '待配置',
    tone: 'neutral',
    detail: '需要确认 Skill 安装入口',
  },
} as const;
export const skillActions: Record<SkillAction, string> = {
  install: '安装',
  update: '更新',
  repair: '修复链接',
  remove: '卸载',
  configure: '配置入口',
};
export const skillTargets: SkillTarget[] = [
  {
    id: 'codex',
    name: 'Codex',
    client: 'Desktop / CLI',
    state: 'ready',
    path: '~/.codex/skills/agent-sessions',
    method: 'link',
    note: '文件已就绪，Agent 加载情况待新会话验证',
  },
  {
    id: 'claude',
    name: 'Claude Code',
    client: 'Desktop / CLI',
    state: 'outdated',
    path: '~/.claude/skills/agent-sessions',
    method: 'copy',
    note: '更新前可预览将被替换的文件',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    client: 'Agent',
    state: 'missing',
    path: '~/.cursor/skills/agent-sessions',
    method: 'link',
    note: '安装到当前用户，供本机项目使用',
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    client: 'Desktop / CLI',
    state: 'broken',
    path: '自定义安装入口',
    method: 'link',
    note: '重新选择安装入口后可修复链接',
  },
  {
    id: 'dsh',
    name: 'DeepSeek Harness',
    client: 'DSH',
    state: 'unconfigured',
    path: '',
    method: 'link',
    note: '先选择当前客户端使用的 Skill 目录',
  },
];
export function suggestedAction(target: SkillTarget): SkillAction {
  return {
    ready: 'update',
    outdated: 'update',
    missing: 'install',
    broken: 'repair',
    unconfigured: 'configure',
  }[target.state] as SkillAction;
}
export function installedTarget(target: SkillTarget) {
  return ['ready', 'outdated', 'broken'].includes(target.state);
}
