# Agent Sessions 本地会话查看器

## 运行与核验

从仓库目录执行 `npm ci`、`npm run build:ui`，再启动 `python3 scripts/trajectory_server.py --port 8765`。开发时另开 `npm run dev`，Vite 将 API 请求代理到 8765。服务只绑定 `127.0.0.1`；可使用 `--codex-home`、`--claude-home`、`--antigravity-home`、`--antigravity-cli-home` 指定来源目录；`--state-home` 指定应用整理设置目录。`--codex-only` 可仅运行原有 Codex 适配器。

地址使用 `?id=来源:实例:原生键&ref=事件引用`，原有 Codex `?id=会话UUID&ref=T003/C002` 深链接仍兼容。默认会话依次取 URL、`CODEX_THREAD_ID`、最近的本地会话。服务读 `sessions/`、`archived_sessions/` 和 `session_index.jsonl`，缓存由原有解析器增量维护。未写完的 JSONL 行等待完整换行后才显示。

如果浏览器空白，先核验服务地址，再查看会话格式警告；不要因此直接导出原始 rollout。服务没有远程请求、聊天发送或原始文件写入接口。

验证命令：

```bash
npm run build:ui
npm run test
```

HTTP 测试验证新旧消息格式、原值、延迟结果读取、分页、聚合高亮、增量追加与只读访问边界；恢复测试验证已有命令；聊天测试验证旧记录缺少回答阶段标记、导入标记、进行中轮次与分页边界。

## 交互与数据范围

侧栏按项目分组，优先读取 `.codex-global-state.json` 的 `local-projects` 与 `thread-project-assignments`，保留项目的真实名称。同一目录属于多个项目时，按会话明确归属区分，不能凭目录猜项目。`projectless-thread-ids` 中的会话归入“未分配项目”；其余历史记录使用工作目录分组。只读取所需项目元数据，不修改 Codex 设置。项目列表覆盖全部本地记录，会话列表按项目分页加载，每页最多 100 条，默认展开当前项目。

会话置顶、显示名称、归档和项目映射通过本地 API 写入应用独立的 `view.json`，macOS 默认位于 `~/Library/Application Support/Agent Sessions/`。后台使用动态端口时也能复用设置；旧浏览器设置在首次读取时迁移，旧 Codex UUID 转换为统一来源键。归档可恢复，不改各 Agent 自身会话状态，也不删除源文件。

每个项目默认显示 5 条会话，其余通过“展开其余 N 个会话”加载；当前会话保留在默认列表中。会话直接从项目列表打开，顶部放置 Agent Sessions 名称，不再展示品牌图片或“选择会话”大按钮；搜索由项目标题旁的图标打开。侧栏收起后，标题栏提供重新展开入口。对话与轨迹分别保留已加载内容、搜索条件、详情和滚动位置，切换会话时重置。

对话页使用聊天气泡和 Markdown 助手正文，向上或向下滚动到边缘时自动加载相邻历史页，没有“加载更早/更多对话”按钮；向前补页时保留已加载记录和阅读位置。过程消息与工具调用集中折叠；点击可跳转到轨迹中的同一引用。用户消息中 Codex 附加的浏览器/附件包装投影为正文和“附带上下文与附件”入口；事件的原始内容与复制内容仍保留原文。这是展示层整理，不替换任何字段值。

旧记录未标记回答阶段时，已结束轮次最后一条可见助手消息单独显示为正文；忽略外部导入结束标记，进行中轮次和未加载完的末尾轮次不据此推断。此规则只影响展示，不改原始阶段或状态。代码块保留换行，提供语言标签和复制入口；代码与宽表格在块内横向滚动。展开分页消息时重新解析完整已展开 Markdown，避免跨页代码块或表格断开。

轨迹页复用统一消息引用，滚到列表上、下边缘时自动补齐相邻页，没有加载按钮；向前补页保留阅读位置，时间线跳转后的前后记录也可继续滚动查看。时间线超过 250 个位置时按相邻事件聚合，悬停会标明聚合数量；点击定位其中首条事件，聚合内其他已选消息也能高亮。搜索使不匹配的片段变淡。拖动时间线聚焦范围、滚轮缩放、Shift＋滚轮横向平移、按住右键拖动平移，双击仅取消圈选并保留当前缩放和横向位置。Shift 平移兼容浏览器转换后的横向滚轮信号；触控板横向滚动也可平移，保持当前缩放比例，并在轨迹首尾停止。圈选结束后按完整事件索引定位，自动加载目标页；小范围滚到中间记录，大范围滚到首条，保持详情选择不变。空范围提示没有记录，右键平移和取消拖动不触发定位；较晚返回的定位请求不能覆盖新的圈选。时长尺度使用完整事件时间边界，不依赖聚合采样。定位时自动展开目标所在的折叠轮次或工具调用。详情面板左侧边缘可拖动，双击恢复宽度。

只展示用户/助手可见消息、调用元数据、按需结果、媒体引用与压缩位置；system/developer、reasoning、压缩载荷和 token 统计不进入 UI。消息兼容旧的 `user_message` / `agent_message` 与 Desktop `item_completed` 中的 `UserMessage` / `AgentMessage`。

每次轨迹请求最多 250 条，默认 150 条；事件正文每页 7000 字符。工具结果只在“结果”页签中读取，列表不预加载结果正文。搜索覆盖可见消息全文、事件引用和调用输入摘要，不搜索工具结果正文。媒体目前展示引用与来源，不自动请求远程图片/音频。

内部调用的参数元数据最多 2500 字符，超过时提示前往外层调用查看完整输入；结果仅在用户打开结果页或调用 evidence 时匹配，不预读。对于已验证的 Promise.all/allSettled 编号输出，按明确编号关联；对于明确的逐条 text(await tools...) 输出，验证文本块数量后按输出顺序关联。重复编号、缺失或截断的 JSON、未支持的控制流不按数量猜测，不将组合输出作为独立结果返回；提供组合调用入口。内部调用状态从匹配到的独立结果取得，读取前显示未读取。外层记录保留完整组合输出。工具状态沿用原解析器根据结果结构/标记推断；记录间隔只表示调用与结果时间戳之差，不等于工具内部执行时间。未记录的 Schema、模型首字时间等显示“未记录”。

## 界面来源与版权

参考官方仓库 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，固定源码提交 `639ed015397290b3745d163aafe02ffee4aa3f84`。同时通过原生界面核对本机 `0.2.0-rc.2` 的对话页、轨迹工具栏与详情页签。

`frontend/public/harness.css` 由以下 MIT 源文件适配，主要改动为 CSS 模块选择器改为普通选择器、工具栏/时间线类名前缀和字体变量合并：

- `packages/client/ui-theme/src/styles/{base,design-platform,gradient-shadow-text}.css`
- `packages/client/ui-trajectory/src/client/{TrajectoryToolbar,TrajectoryTimeline,TrajectoryTable}.module.css`

界面使用独立的 Agent Sessions 文字标识，不展示 DeepSeek 的品牌 SVG。对话气泡尺寸及正文节奏参考 `ui-chat` 的 `MessageItem`、`AssistantMarkdown`、`ChatView`；应用外壳在 React 组件与 Tailwind 布局中实现，后台适配器在 `backend/agent_sessions/sources/` 中实现。版权声明保存在 `harness-license.txt`。

`icons.svg` 复用 `ui-primitives/src/icons/index.tsx`、`shared-artwork.tsx` 与 `TrajectoryTable.tsx` 的原始 SVG。轮次/调用展开收起图标按原工具栏的方框加减图形绘制为 SVG。图标通过本地 SVG sprite 加载，无外部字体或 CDN。界面保留项目会话侧栏、对话、轨迹与事件详情，移除了底部输入框。

Markdown 分词使用本地随附的 Marked `17.0.5`（MIT），随 Vite 从 npm 依赖打包，许可证在 `frontend/public/marked-license.txt`。分词结果用 React 节点构建，不执行记录里的 HTML；原文保留在事件详情中。运行时无需外部 CDN。

## Antigravity 执行结果

桌面端与 CLI 在来源筛选、会话标签和设置中分开。导出的 PLANNER_RESPONSE 常没有调用 ID：仅当下一条 GENERIC 的完整 search_web 查询与唯一调用完全一致、步骤连续时，才归并为该调用的结果；有唯一原生 ID 时使用 ID。不同查询、多调用或只包含 503 错误的记录不能靠顺序配对，保留为“执行结果”。旧 `S/结果步骤` 深链接仍解析到已关联的调用，原文按需读取。
