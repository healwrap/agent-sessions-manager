import type { GuideStep } from '../state/guide-store';

export const guideSteps: Record<
  GuideStep,
  { title: string; chapter: string; hint: string }
> = {
  'proxy-nav': {
    title: '先准备这个账号的代理',
    chapter: '代理准备 · 1 / 5',
    hint: '点击左侧「代理设置」。这里只配置应用使用的代理，不需要开启系统代理。',
  },
  'proxy-add': {
    title: '添加一条专用代理',
    chapter: '代理准备 · 2 / 5',
    hint: '点击「添加代理」。已有地址可以直接添加，订阅或配置可以创建由应用管理的代理。',
  },
  'proxy-form': {
    title: '填写并保存代理',
    chapter: '代理准备 · 3 / 5',
    hint: '填写代理信息后保存。导入订阅时，读取配置、选择固定使用的节点，再创建专用入口。',
  },
  'proxy-test': {
    title: '检测刚保存的代理',
    chapter: '代理准备 · 4 / 5',
    hint: '点击这条代理的「检测」，等待真实结果。需要中转的静态代理，先确认上游线路配置。',
  },
  'proxy-result': {
    title: '确认最终出口',
    chapter: '代理准备 · 5 / 5',
    hint: '检测会显示 Claude 链路的出口 IP。取得结果后，核对地区再继续；失败时修改配置并重新检测。',
  },
  'account-add': {
    title: '添加要使用的账号',
    chapter: '账号配置 · 1 / 2',
    hint: '点击「添加账号」，填写账号邮箱并选择要使用的代理。',
  },
  'account-form': {
    title: '保存资料，创建独立环境',
    chapter: '账号配置 · 2 / 2',
    hint: '填写邮箱、确认代理后保存。这里创建本地账号入口与环境，实际登录在下一步完成。',
  },
  'account-open': {
    title: '从这里打开专用环境',
    chapter: '首次登录 · 1 / 3',
    hint: '点击账号的登录或打开按钮。请等待启动检查通过，再在对应窗口完成登录。',
  },
  login: {
    title: '完成登录，再核对账号',
    chapter: '首次登录 · 2 / 3',
    hint: '在绑定环境中发起邮件登录，将邮件中的完整链接复制回绑定浏览器打开。',
  },
  'switch-stop': {
    title: '先停止当前环境',
    chapter: '切换账号 · 1 / 2',
    hint: '点击「停止」保留本地登录数据，通常不需要 Claude Log out。',
  },
  'switch-pick': {
    title: '选择另一个账号',
    chapter: '切换账号 · 2 / 2',
    hint: '在列表中选择另一个账号，再打开它自己的环境。',
  },
  done: {
    title: '可以从这里继续使用',
    chapter: '本段引导已完成',
    hint: '以后从账号管理进入对应环境。需要其他操作时，可以在「帮助与引导」重新开始一段短引导。',
  },
};
