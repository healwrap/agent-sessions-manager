# Agent Sessions UI

所有管理类页面从 `components/ui` 导入公共组件。底层沿用 DSH tokens 与现有控件，不安装第二套组件库。

## 层级

| 层级     | 内容                                                                                      | 所属文件                            |
| -------- | ----------------------------------------------------------------------------------------- | ----------------------------------- |
| 设计变量 | 主色、画布、面板、边框、间距、圆角、动效                                                  | `styles/ui-foundations.css`         |
| 基础控件 | Button、IconButton、TextInput、Select、SearchField、StatusBadge、Disclosure、EditorDialog | 原有组件，由 `ui/index.ts` 统一导出 |
| 页面组合 | PageHeading、SectionHeading、Panel、IconTile、FactsGrid                                   | `ui/layout.tsx`                     |
| 集合操作 | ChoiceGroup、CollectionToolbar                                                            | `ui/collection.tsx`                 |
| 状态反馈 | EmptyState、BusyState、Notice、RemoveButton                                               | `ui/feedback.tsx`                   |
| 资源展示 | ResourceCard                                                                              | `ui/resource-card.tsx`              |
| 表单     | Field                                                                                     | `ui/field.tsx`                      |

工作区外壳、侧栏与工作区切换器同样由公共入口导出，沿用 `WorkspaceLayout`、`WorkspaceSidebar`、`WorkspacePicker`。

## 使用约定

- 页面容器使用 `ui-page`。主要内容使用 Panel 或 ResourceCard，页面标题使用 PageHeading。
- 一个操作区域只保留一个主要按钮。已有窗口显示“切回窗口”；检查中显示进度并禁用重复启动。
- ChoiceGroup 用于互斥选择，支持左右方向键、Home、End。CollectionToolbar 统一搜索与筛选，业务页面维护筛选值。
- FactsGrid 传入 `{ label, value, icon? }[]`，用于环境、账号、安装等事实；长 IP、路径和时区允许换行。
- Field 的文本输入通过 `htmlFor` 和输入 `id` 关联；Select 自身必须有 `label`。
- Notice 只承载可操作的反馈。一般信息不新增小字说明；错误保留原始反馈。BusyState 和空状态分别渲染。
- 各组件只负责呈现与交互，不请求接口、不读写账号、不修改全局系统设置。
- 颜色来自 DSH，新增语义变量统一放在 `ui-foundations.css`。避免在业务样式中重复实现按钮、标签、空状态或折叠交互。
- 正文 15px，控件 14px，页面标题 23px。控件不靠缩小文字适配空间。
- 动效使用 `--ui-motion`，沿用全局减少动态效果和关闭动画设置。

## 开发预览

启动现有 Vite 开发服务后访问 `/?components=1`。预览包含浅深色、按钮、搜索与筛选、资源状态、表单弹窗、错误、加载及空列表。示例只维护页面内状态。

组件预览入口仅在开发模式加载，不进入生产应用的用户导航。新增组件应先加入这里，再在至少一个真实页面使用。

```tsx
import { CollectionToolbar, FactsGrid, ResourceCard } from './ui';

<ResourceCard title={profile.name} icon={<BrowserIcon />} actions={actions}>
  <FactsGrid items={facts} />
</ResourceCard>;
```
