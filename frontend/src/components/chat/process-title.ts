import type { Event } from '../../lib/types';

const names: Record<string, string> = {
  read: 'read',
  read_file: 'read',
  view_file: 'read',
  read_image: 'readImage',
  grep: 'search',
  glob: 'search',
  search: 'search',
  write: 'write',
  write_file: 'write',
  edit: 'edit',
  edit_file: 'edit',
  apply_patch: 'edit',
  bash: 'commands',
  pwsh: 'commands',
  exec_command: 'commands',
  write_stdin: 'commands',
  run_command: 'commands',
  run_terminal_cmd: 'commands',
  run_terminal_command: 'commands',
  run_code: 'code',
  exec: 'code',
  web_search: 'webSearch',
  search_web: 'webSearch',
  web_fetch: 'webFetch',
  subagent: 'subagents',
  spawn_agent: 'subagents',
  send_input: 'subagents',
  followup_task: 'subagents',
  wait_agent: 'subagents',
  resume_agent: 'subagents',
  close_agent: 'subagents',
  interrupt_agent: 'subagents',
  list_agents: 'subagents',
  todo_write: 'plan',
  create_goal: 'plan',
  update_goal: 'plan',
  get_goal: 'plan',
  ask_user_question: 'questions',
  request_user_input: 'questions',
};
const labels: Record<string, string> = {
  read: '已读取文件',
  readImage: '已读取图片',
  search: '已搜索代码',
  write: '已写入文件',
  edit: '修改了文件',
  commands: '执行了命令',
  code: '运行了代码',
  webSearch: '已搜索网页',
  webFetch: '已访问网页',
  subagents: '已协调子智能体',
  plan: '更新了计划',
  questions: '向用户提出了问题',
  tools: '已调用工具',
};
const toolTitles: Record<string, string> = {
  bash: '运行命令',
  pwsh: '运行命令',
  exec_command: '运行命令',
  run_command: '运行命令',
  run_terminal_cmd: '运行命令',
  run_terminal_command: '运行命令',
  read: '读取',
  read_file: '读取文件',
  view_file: '读取文件',
  read_image: '读取图片',
  write: '写入',
  write_file: '写入文件',
  edit: '编辑',
  edit_file: '编辑文件',
  apply_patch: '编辑文件',
  grep: '搜索',
  glob: '搜索',
  web_search: '搜索网页',
  search_web: '搜索网页',
  web_fetch: '访问网页',
  run_code: '代码',
  exec: '运行代码',
  spawn_agent: '创建子代理',
  send_input: '发送子代理指令',
  followup_task: '继续子代理任务',
  wait_agent: '等待子代理',
  resume_agent: '恢复子代理',
  close_agent: '关闭子代理',
  interrupt_agent: '中断子代理',
  list_agents: '查看子代理',
};
function toolName(event: Event) {
  const name = (event.name.split('__').at(-1) || event.name)
    .split('.')
    .at(-1)!
    .toLowerCase()
    .replace(/_v\d+$/, '');
  if (
    /(?:^|[._])(?:collaboration|multi_agent(?:_v\d+)?)[._]/.test(event.name)
  ) {
    if (name === 'wait') return 'wait_agent';
    if (name === 'send_message') return 'send_input';
  }
  return name;
}
function activity(event: Event) {
  const name = toolName(event);
  return (
    names[name] ||
    (/^terminal_/.test(name)
      ? 'commands'
      : /^subagent_/.test(name)
        ? 'subagents'
        : /_inspect$/.test(name)
          ? 'search'
          : 'tools')
  );
}
export function toolTitle(event: Event) {
  return toolTitles[toolName(event)] || '工具调用';
}
export function toolSummary(event: Event) {
  const summary =
    event.status === 'error'
      ? event.output_preview || event.preview
      : event.program_summary || event.argument_summary || event.preview;
  return toolTitle(event) === '工具调用'
    ? `${event.name} · ${summary}`
    : summary;
}
function activities(events: Event[]) {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!['tool', 'subtool'].includes(event.kind)) continue;
    const kind = activity(event);
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}
export function activityIcon(events: Event[]) {
  const kind = activities(events)[0]?.[0] || 'thinking';
  return (
    (
      {
        thinking: 'think',
        commands: 'terminal',
        code: 'code',
        subagents: 'agents',
        questions: 'question',
        search: 'search',
        read: 'clip',
        readImage: 'clip',
        edit: 'edit',
        write: 'edit',
        tools: 'sparkle',
      } as Record<string, string>
    )[kind] || 'wrench'
  );
}
export function activityTitle(events: Event[]) {
  const ranked = activities(events),
    titles = ranked.slice(0, 3).map(([kind]) => labels[kind]);
  if (!titles.length) return '已完成分析';
  if (titles.length === 2)
    return (
      titles[0] +
      '并' +
      (titles.every((t) => t.startsWith('已')) ? titles[1].slice(1) : titles[1])
    );
  return titles.join('，') + (ranked.length > 3 ? '等' : '');
}
export function liveActivityTitle(events: Event[]) {
  const last = events.at(-1);
  if (!last || last.kind === 'assistant') return '正在分析';
  const kind = activity(last);
  return (
    {
      read: '正在读取文件',
      readImage: '正在读取图片',
      search: '正在搜索代码',
      write: '正在写入文件',
      edit: '正在修改文件',
      commands: '正在运行命令',
      code: '正在运行代码',
      webSearch: '正在搜索网页',
      webFetch: '正在访问网页',
      subagents: '正在协调子智能体',
      plan: '正在更新计划',
      questions: '等待你的操作',
      tools: '正在调用工具',
    } as Record<string, string>
  )[kind];
}
export function turnTitle(events: Event[]) {
  const state = events.find((event) => event.turn_status)?.turn_status;
  const label =
    state === 'aborted' ? '已停止' : state === 'error' ? '处理失败' : '已完成';
  const ms = events.find((event) =>
    Number.isFinite(event.turn_duration_ms),
  )?.turn_duration_ms;
  if (ms == null || state === 'aborted' || state === 'error') return label;
  const seconds = Math.max(1, Math.floor(ms / 1000));
  const duration =
    seconds >= 3600
      ? `${Math.floor(seconds / 3600)}小时${Math.floor((seconds % 3600) / 60)}分${seconds % 60}秒`
      : seconds >= 60
        ? `${Math.floor(seconds / 60)}分${seconds % 60}秒`
        : `${seconds}秒`;
  return `${label}，用时 ${duration}`;
}
