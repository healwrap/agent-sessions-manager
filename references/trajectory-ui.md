# 本地会话查看器

## 运行与核验

从 Skill 目录启动 `python3 scripts/trajectory_server.py --port 8765`。服务只绑定 `127.0.0.1`；使用 `--codex-home /绝对路径` 可选择其他 Codex 记录目录。

浏览器地址支持 `?id=会话UUID&ref=T003/C002`。默认会话依次取 URL、`CODEX_THREAD_ID`、最近的本地会话。服务读 `sessions/`、`archived_sessions/` 和 `session_index.jsonl`，缓存由原有解析器增量维护。未写完的 JSONL 行等待完整换行后才显示。

如果浏览器空白，先核验服务地址，再查看会话格式警告；不要因此直接导出原始 rollout。服务没有远程请求、聊天发送或原始文件写入接口。

验证命令：

```bash
python3 scripts/trajectory_self_test.py
python3 scripts/self_test.py
node scripts/trajectory_chat_self_test.cjs
```

HTTP 测试验证新旧消息格式、原值、延迟结果读取、分页、聚合高亮、增量追加与只读访问边界；恢复测试验证已有命令；聊天测试验证旧记录缺少回答阶段标记、导入标记、进行中轮次与分页边界。

## 交互与数据范围

侧栏按项目分组，优先读取 `.codex-global-state.json` 的 `local-projects` 与 `thread-project-assignments`，保留项目的真实名称。同一目录属于多个项目时，按会话明确归属区分，不能凭目录猜项目。`projectless-thread-ids` 中的会话归入“未分配项目”；其余历史记录使用工作目录分组。只读取所需项目元数据，不修改 Codex 设置。项目列表覆盖全部本地记录，会话列表按项目分页加载，每页最多 100 条，默认展开当前项目。

会话置顶、显示名称与归档列表保存在当前浏览器的本地视图设置中。归档可恢复，不改 Codex 自身会话状态，也不删除源文件。不同浏览器或端口有各自的视图设置。

每个项目默认显示 5 条会话，其余通过“展开其余 N 个会话”加载；当前会话保留在默认列表中。侧栏收起后，标题栏提供重新展开入口。对话与轨迹分别保留已加载内容、搜索条件、详情和滚动位置，切换会话时重置。

对话页使用聊天气泡和 Markdown 助手正文。过程消息与工具调用集中折叠；点击可跳转到轨迹中的同一引用。用户消息中 Codex 附加的浏览器/附件包装投影为正文和“附带上下文与附件”入口；事件的原始内容与复制内容仍保留原文。这是展示层整理，不替换任何字段值。

旧记录未标记回答阶段时，已结束轮次最后一条可见助手消息单独显示为正文；忽略外部导入结束标记，进行中轮次和未加载完的末尾轮次不据此推断。此规则只影响展示，不改原始阶段或状态。代码块保留换行，提供语言标签和复制入口；代码与宽表格在块内横向滚动。展开分页消息时重新解析完整已展开 Markdown，避免跨页代码块或表格断开。

轨迹页复用统一消息引用。时间线超过 250 个位置时按相邻事件聚合，悬停会标明聚合数量；点击定位其中首条事件，聚合内其他已选消息也能高亮。搜索使不匹配的片段变淡。拖动时间线聚焦范围、滚轮缩放、右键拖动平移，双击复原。拖动结束不触发误选；点击定位时自动展开目标所在的折叠轮次或工具调用。详情面板左侧边缘可拖动，双击恢复宽度。

只展示用户/助手可见消息、调用元数据、按需结果、媒体引用与压缩位置；system/developer、reasoning、压缩载荷和 token 统计不进入 UI。消息兼容旧的 `user_message` / `agent_message` 与 Desktop `item_completed` 中的 `UserMessage` / `AgentMessage`。

每次轨迹请求最多 250 条，默认 150 条；事件正文每页 7000 字符。工具结果只在“结果”页签中读取，列表不预加载结果正文。搜索覆盖可见消息全文、事件引用和调用输入摘要，不搜索工具结果正文。媒体目前展示引用与来源，不自动请求远程图片/音频。

内部调用的参数元数据最多 2500 字符，超过时提示前往外层调用查看完整输入；结果明确标为共享外层结果，不进行单独归因。工具状态沿用原解析器根据结果结构/标记推断；记录间隔只表示调用与结果时间戳之差，不等于工具内部执行时间。未记录的 Schema、模型首字时间等显示“未记录”。

## 界面来源与版权

参考官方仓库 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，固定源码提交 `639ed015397290b3745d163aafe02ffee4aa3f84`。同时通过原生界面核对本机 `0.2.0-rc.2` 的对话页、轨迹工具栏与详情页签。

`assets/trajectory/harness.css` 由以下 MIT 源文件适配，主要改动为 CSS 模块选择器改为普通选择器、工具栏/时间线类名前缀和字体变量合并：

- `packages/client/ui-theme/src/styles/{base,design-platform,gradient-shadow-text}.css`
- `packages/client/ui-trajectory/src/client/{TrajectoryToolbar,TrajectoryTimeline,TrajectoryTable}.module.css`

品牌 SVG 保留 `packages/client/ui-primitives/src/BrandWordmark.tsx` 的路径、徽标背景与裁切。对话气泡尺寸及正文节奏参考 `ui-chat` 的 `MessageItem`、`AssistantMarkdown`、`ChatView`；应用外壳与 Codex 数据适配在 `style.css` / `app.js` 中实现。品牌仅用于设计参考，界面标注“Codex 轨迹”。版权声明保存在 `harness-license.txt`。

`icons.svg` 复用 `ui-primitives/src/icons/index.tsx`、`shared-artwork.tsx` 与 `TrajectoryTable.tsx` 的原始 SVG。轮次/调用展开收起图标按原工具栏的方框加减图形绘制为 SVG。图标通过本地 SVG sprite 加载，无外部字体或 CDN。界面保留项目会话侧栏、对话、轨迹与事件详情，移除了底部输入框。

Markdown 分词使用本地随附的 Marked `17.0.5`（MIT），文件 `marked.js` / `marked-license.txt`。分词结果用 DOM 节点构建，不执行记录里的 HTML；原文保留在事件详情中。没有外部 CDN 或构建时下载要求。
