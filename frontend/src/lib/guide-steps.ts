import type { GuideStep } from '../state/guide-store';

export const guideSteps: Record<
  GuideStep,
  { title: string; chapter: string; hint: string }
> = {
  'proxy-nav': {
    title: '配置网络',
    chapter: '网络准备 · 1 / 5',
    hint: '点击左侧「网络设置」。',
  },
  'proxy-add': {
    title: '添加 Claude 节点',
    chapter: '网络准备 · 2 / 5',
    hint: '点击「添加节点」。',
  },
  'proxy-form': {
    title: '保存 Claude 节点',
    chapter: '网络准备 · 3 / 5',
    hint: '填写节点名称和代理地址，然后保存。',
  },
  'proxy-test': {
    title: '检测代理',
    chapter: '网络准备 · 4 / 5',
    hint: '点击「检测」，确认出口 IP。',
  },
  'proxy-result': {
    title: '确认出口',
    chapter: '网络准备 · 5 / 5',
    hint: '核对出口 IP 和地区。',
  },
  'account-add': {
    title: '添加账号',
    chapter: '账号配置 · 1 / 2',
    hint: '点击「添加账号」。',
  },
  'account-form': {
    title: '保存账号',
    chapter: '账号配置 · 2 / 2',
    hint: '填写邮箱、选择出口线路，然后保存。',
  },
  'account-open': {
    title: '打开环境',
    chapter: '首次登录 · 1 / 3',
    hint: '点击打开，等待启动检查完成。',
  },
  login: {
    title: '登录账号',
    chapter: '首次登录 · 2 / 3',
    hint: '用邮箱登录，邮件链接在此账号的浏览器中打开。',
  },
  'switch-stop': {
    title: '停止环境',
    chapter: '切换账号 · 1 / 2',
    hint: '点击「停止」，登录状态会保留。',
  },
  'switch-pick': {
    title: '选择另一个账号',
    chapter: '切换账号 · 2 / 2',
    hint: '选另一个账号，打开它的环境。',
  },
  done: {
    title: '已完成',
    chapter: '本段引导已完成',
    hint: '以后从账号列表打开对应环境。',
  },
};
