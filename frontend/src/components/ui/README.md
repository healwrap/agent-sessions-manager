# Agent Sessions UI · DSH 组件适配

公共组件从 `components/ui` 导入。基础控件以 DSH 原组件源码为准，页面组合延续相同材质与几何，不建立第二套视觉规范。

## DSH 来源

对应本机 `deepseek-harness` 源码版本 `717ed6700ae3128f90fe05cbfd22fe6f9483eb18`。DSH 为 MIT 许可，声明保留在 `public/harness-license.txt`。

| 组件 / 规则                    | DSH 原始来源（相对 DSH 仓库）                                                                                                                                              | 本项目适配                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Button                         | `packages/client/ui-primitives/src/Button.module.css`                                                                                                                      | `styles/dsh/controls.css`                                                                       |
| Disclosure 折叠标题            | `packages/client/ui-primitives/src/DisclosureRow.module.css`                                                                                                               | `styles/disclosure.css`，透明标题，悬停只改变文字颜色；管理区增加点击留白                       |
| Input / TextArea / SearchField | `packages/client/ui-primitives/src/Input.module.css`                                                                                                                       | `styles/dsh/input.css` 统一文字、占位提示、焦点与禁用态；`styles/search-field.css` 负责搜索容器 |
| ChoiceGroup 分段选择           | `packages/client/ui-primitives/src/SegmentedControl.module.css`                                                                                                            | `styles/dsh/choices.css`，保留滑动指示器                                                        |
| ChoiceGroup 下划线导航         | `packages/client/ui-settings-plugins/src/client/PluginsSettingsSection.module.css`                                                                                         | `styles/dsh/choices.css`                                                                        |
| Select / 菜单                  | `ui-primitives/src/Menu.module.css`、`MenuSurface.module.css`、`ui-settings-plugin-inventory/src/client/PluginInventorySettingsTab.module.css`（均位于 `packages/client`） | `select.tsx`、`styles/dsh/menu.css`                                                             |
| 状态标签几何                   | `packages/client/ui-primitives/src/Pill.module.css`                                                                                                                        | `styles/form-controls.css`，状态色使用 DSH 语义别名                                             |
| ContentDialog / EditorDialog   | `packages/client/ui-primitives/src/Modal.module.css`                                                                                                                       | `styles/form-controls.css`，共用标题、关闭、滚动体与底部操作区                                  |
| 设置面板                       | `packages/client/ui-settings-general/src/client/SettingsRoot.module.css`                                                                                                   | `styles/settings.css`                                                                           |
| Panel / ResourceCard 材质      | `docs/ui-radius.zh.md` 的设置卡片规范                                                                                                                                      | `styles/ui-foundations.css`                                                                     |
| 主题补充                       | `packages/client/ui-theme/src/styles/{design-platform,base,gradient-shadow-text}.css`                                                                                      | `styles/dsh/controls-theme.css`，只补充实际使用的原始别名                                       |

修改视觉前先对照 DSH 原组件和 `docs/web-styling.zh.md`、`docs/ui-radius.zh.md`。主按钮为中性黑白色；业务蓝用于链接与焦点等既有语义，不替换主按钮色。

## 公共组件

| 类别     | 组件                                                                                                               | 职责                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| 基础控件 | Button、IconButton、TextInput、TextArea、Select、SearchField、StatusBadge、Disclosure、ContentDialog、EditorDialog | 适配 DSH 控件与交互                      |
| 页面组合 | PageHeading、SectionHeading、Panel、LeadingIcon、FactsGrid                                                         | 标题、信息分组、图标与事实展示           |
| 集合操作 | ChoiceGroup、CollectionToolbar、CollectionPanel、MasterDetail                                                      | 互斥选择、搜索与筛选                     |
| 状态反馈 | EmptyState、BusyState、Notice、RemoveButton                                                                        | 空列表、加载、操作反馈与移除确认         |
| 使用引导 | GuidedTour、GuideLink                                                                                              | 高亮真实控件、展示步骤与资料入口         |
| 资源展示 | ResourceCard、ResourceRow                                                                                          | 组合身份、状态、操作、内容及折叠区       |
| 表单     | Field                                                                                                              | 标签与控件关联                           |
| 工作区   | WorkspaceLayout、WorkspaceSidebar、WorkspacePicker、SettingsButton                                                 | 页面外壳、导航、工作区切换与全局设置入口 |

页面组合是 Agent Sessions 的业务组件，并非声称 DSH 存在同名组件。它们只组合布局与数据，复用 DSH 控件、设置卡片材质和文字层级。

## 使用约定

- 页面使用 `ui-page` 与 PageHeading；按信息分组选择 Panel / ResourceCard，不为装饰而重复套卡片。
- Button 标准 H36 / R12，紧凑 H28 / R8；`primary`、`outline`、`ghost`、`toolbar` 对应 DSH 原变体。兼容原 API：`secondary` 为描边按钮，`text` 为 ghost。
- Input H32 / R12、选择器 H36 / R12；控件正文 14px / 22px。不在业务页面覆盖按钮填充、圆角与字号。
- 单行文字使用 TextInput，多行文字使用 TextArea，搜索使用 SearchField，均从 `components/ui` 导入。三者通过 `text-control` 共用 `styles/dsh/input.css`；占位提示使用 label-secondary 并固定 opacity: 1，禁用态单独处理。业务页面不另写占位提示色；原生 checkbox、range、file 等非文字控件按各自规则保留。
- Panel / ResourceCard 使用 DSH 设置卡片：R20、0.5px 描边、layer-2 底色，无额外投影。高层级弹窗保留 DSH elevation 与遮罩。
- ChoiceGroup 分段指示器按 DSH 算法滑动，支持方向键、Home、End，并尊重关闭动画与减少动态效果。
- LeadingIcon 只容纳图标，不额外添加彩色底框。FactsGrid 展示真实字段，长 IP、路径和时区可换行。
- Field 的文本标签通过 `htmlFor` 与输入 `id` 关联；Select 必须有 `label`。
- Notice 只显示可操作反馈。一般信息不添加小字说明；错误保留原始反馈。
- 一个操作区域只保留一个主要按钮。已有窗口显示“切回窗口”；检查中禁用重复启动。
- SettingsButton 复用 DSH 灰色无底色图标按钮，使用标准 H32 / R12。WorkspaceSidebar 在工作区切换器右侧统一放置设置入口；WorkspaceLayout 在侧栏收起时将入口移到顶部右侧。设置弹窗由工作区根节点统一承载，关闭后保留当前页面。
- 组件不请求业务接口、不读写账号、不修改系统设置。页面持有真实状态。
- ContentDialog 统一管理标题、正文的 24px 水平留白、20px 内容间距、独立滚动体与固定底部操作区。正文直接放入内容，不再由页面添加内边距容器。EditorDialog 复用它的外壳，增加表单提交与字段禁用；内容弹窗内的业务表单不嵌套在另一层 form 中。
- Disclosure 的 `compact` 用于帮助弹窗等紧凑区域：沿用 DSH DisclosureRow 的 24px 标题行、16px 图标占位和 6px 间距，正文与标题文字对齐，段落间距 8px。管理列表继续使用默认的大点击区域；组件预览包含紧凑变体。
- 演示模式直接覆盖当前工作区，内部复用同一个 AccountWorkspace、账号、代理、环境和 GuidedTour 组件，使用内存接口与示例表单值，不维护第二份页面布局。退出恢复原页面；顶栏尺寸与正式页面共用 `--workspace-header-height`。引导演示预览可从组件目录启动。

NumberField 和 Switch 从 `components/ui` 导出，分别用于设置中的有界数字步进与布尔开关，样式复用 DSH 控件变量；会话设置和通用设置已使用，输入预览中提供可交互示例。Select 的 `field` 变体用于设置表单，保留通用选择器的键盘导航和弹窗内点击修复。

## 开发预览

GuidedTour 复用 Driver.js 的定位、遮罩与原生弹窗层级处理，浮层通过 React portal 使用现有 Button / IconButton 和 DSH 语义变量。传入稳定的步骤 ID、定位标记、说明和可选继续操作；组件不请求业务接口。操作成功与否由页面决定。支持动态元素等待、内部滚动定位、关闭动画和 Escape 退出；目标缺失时提供返回当前步骤和暂停入口。GuideLink 用于账号教程与代理获取等资料入口，两者已接入真实账号工作区及组件预览。

ProgressMeter 使用原生 progress 语义，统一显示已用比例，适配 DSH 的业务色、接近额度与达到额度状态。账户用量页和基础组件预览共用此控件。

启动现有 Vite 服务后访问 `/?components=1`，查看浅深色、按钮、搜索筛选、资源状态、表单弹窗、加载与空列表。示例只维护页面内状态。

预览仅在开发模式加载，不进入生产导航。新增公共组件同步加入预览并在至少一个真实页面使用。

## 页面组合

- CollectionPanel 将搜索筛选与列表放在同一个 DSH 设置卡片表面；空状态、加载和筛选无结果均留在这个表面内，避免页面跳动。
- ResourceRow 用于同一集合的资源，行间使用发丝分割线。ResourceCard 保留给独立概览。两者共享身份、状态、操作、内容和展开区的实现。
- MasterDetail 接收导航与详情两个区域，桌面并排，窄布局转为上下；提供 navigationWidth / onNavigationResize 时复用侧边栏拖动引擎，支持方向键微调、双击恢复默认，宽度为 220–520px 并为详情保留 360px。业务页面持有选择、筛选和宽度持久化状态。账号页与交互预览已使用这个组合。
- 同一页面保留一个主要的新建操作；集合内的打开、编辑、检测使用 DSH outline / ghost，避免每行都出现同等醒目的主按钮。
- 可用性与内核信息使用紧凑服务条，详情按字段分组；避免在详情里再次套底色卡片。一般说明不增加小字注释。
- 组合预览在 `design-system/layout-preview.tsx`，仅使用示例数据与页面内交互。
