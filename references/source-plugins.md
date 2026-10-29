# 来源插件接口

各 Agent 的原生文件格式不同，解析差异留在来源模块。目录聚合、HTTP、轨迹和详情组件不识别 Agent 名称。

## 注册

`backend/agent_sessions/sources/contract.py` 定义接口版本 1。`plugins.py` 中的 `SourcePlugin` 注册来源 ID、显示名称、工厂、路径字段、能力与历史路由别名。工厂接收配置中的路径字典，返回以下只读接口：

| 接口 | 返回内容 |
| --- | --- |
| `available()` | 来源目录是否可用 |
| `discover()` | 本地会话目录，包含稳定 ID、标题、更新时间与该 Agent 自己的项目归属 |
| `revision(key)` | 当前会话的轻量变化标记，不读取正文；数据库需包含 WAL，压缩来源需检查原始文件 |
| `trajectory()` | 分页记录、完整导轨、折叠分组、搜索与时长投影 |
| `detail()` | 原始参数或结果、正文、原始内容块、可选 Schema / 附件 / 请求信息 |
| `focus()` | 根据完整记录解析圈选区间及跳转位置 |
| `matches_content()` | 会话标题之外的正文检索 |
| `attachment()` | 只读取所选记录实际引用的附件，不支持时返回明确错误 |

新增来源只需实现上述接口并添加注册项。`SourceRegistry` 检查接口版本、路由冲突与必需方法；设置界面的路径字段和侧栏来源下拉框直接使用注册信息。

适配器还提供 `root: Path`、`rows: dict` 和支持上下文管理的 `lock`。聚合层在目录锁内调用 `discover()`；注册时同时校验这些属性。应用启动时向来源工厂补充 `app:state` 路径，用于只读发现应用管理的环境；该路径不作为用户来源目录配置。上下文引用命令使用统一的 `--source-path SOURCE=PATH`，仅保留所选来源插件登记的目录（包括必要的补充索引），并通过 `--state-home` 恢复受管环境，不维护另一份 Agent 专用参数表。

会话目录可返回 `execution_mode: non_interactive`，表示非交互式启动的任务；`session_source` 保留原生来源名称。执行模式与 `session_kind` 的父子关系独立，公共侧栏按字段展示“非交互任务”，有原生来源时附在括号中；筛选单个 Agent 后仍保留该标识。Codex 仅在原生 `session_meta.source` 明确为 `exec` 时填写，不从提示词、标题或父会话推断，也不将所有非交互任务标为子代理。

## 公共服务和展示

`common.py` 的 `TrajectoryStore` 处理与来源无关的搜索、导轨、分页和范围定位。JSONL 来源可使用 `base.py` 的 `HistoryStore`，数据库来源可覆盖读取方法。它们不再继承 Codex 原生读取器。

标准事件包含 `ref / turn / kind / record_type / timestamp / status / position`。语义类型包括 `user_message`、`assistant_message`、`context_message`、`tool_call`、`subtool_call`、`execution_result`、`system_prompt`、`tool_definitions`、`compaction` 和 `request`。新解析器应直接填写 `record_type`；旧记录的兼容转换集中在 `common.py` 与前端 `record-presentation.ts`。

`position` 是完整记录位置，用于分页和稳定定位。公共布局提供 `timeline_position` 与 `timeline_count` 作为可见顺序导轨的序号和总数；`request_only` 保留请求入口，不生成模型跨度，也不参与圈选。每条可见记录有独立导轨引用，不聚合抽样。

所有来源共用消息概述、工具概述、Markdown、内容块、JSON 树、Schema、计时、工具跳转、附件及请求组件。可选字段决定是否展示相应元素：

- `thinking_text / output_text / tool_calls`：思考折叠、正文和关联工具入口。
- `source_blocks`：按原始顺序展示内容块；工具块的 `ref` 必须是可验证的对应调用。
- `tool_schema`：调用发生时的原生定义，不能套用今天的定义。
- `request_number / request_config / usage`：请求入口、选项和记录下来的用量。
- `attachments`：附件引用与预览；不要求其他来源使用 DSH 的存储方式。
- `parent_ref / attachment_role`：独立媒体记录对应的可见消息及其用户/助手归属；对话不重复展示已归属的附件，轨迹保留原引用。
- `turn_started_at / turn_completed_at / turn_duration_ms`：原始轮次边界与用时；没有结束记录时保持缺失。
- `code_program`：明确记录的可回放源码及语言提示，按通用代码视图展示。

缺失数据保持缺失，不估算首 token 时间、用量、请求次数或独立结果。原始值不得替换；长正文按页读取，原始块按需加载。

### 附件数据

附件提供 `index / attachmentId` 及可选的 `kind: image | file`、`name`、`mediaType`、`bytes`、`width / height`。没有 MIME 的文件按扩展名展示；没有大小或尺寸时不填零。`available: false` 与 `unavailable_reason` 表示本地仅保留引用，公共组件不发起无效图片请求。原始内容块可关联同一附件描述，但原始 JSON 保持原值。

来源内部实现 `attachment()`：DSH 读取历史引用的内容寻址图片，Claude Code 读取原生内嵌图片，Cursor 读取消息已保存路径指向的自有图片缓存。端点只接受记录引用和附件序号，不接受任意文件路径，也不自动下载外部媒体。纯媒体消息是否可见仍遵守来源本身的可渲染标记。

Codex 同样实现标准 `attachment()`，用户图片优先读取历史中的嵌入副本。可见 Markdown 的本地图片走公共 `/api/message-image`：请求带来源、记录、页码及原始引用，后台核对该页实际引用并检查图片格式和大小后读取，不按 Agent 名称选择渲染器。`/api/event` 返回的 `inline_images` 标明图片所属正文页，展开更多页及自动刷新时保留对应关系。

视频遵循 DSH 文件卡片行为，展示类型图标和已有元数据。插件声明附件能力不表示每条记录都有可读取实体，也不表示已实现视频播放；当前本机样本未验证视频附件实体。

## 兼容边界

Claude 桌面索引与 CLI 正文的合并和去重在 `claude_source.py` 内完成。旧 `claude:desktop` 链接通过插件声明的别名路由读取，会话名称、收藏及归档 ID 保持兼容。旧无来源前缀的 Codex UUID 在目录路由边界兼容，其他读取器不借用 Codex 的项目身份。

`claude_accounts.py` 在默认目录之外读取 `environments.json` 登记的 Claude App 环境，复用同一解析器。受管会话使用 `profile/环境ID/原会话键` 命名空间，父子关系保持在各自环境内；账号名称取当前绑定，解除绑定后沿用保存的环境归属。账号与环境字段由通用会话行携带，不改变原始记录。只有桌面索引的环境仍可列出会话，打开时保留缺少正文的说明。浏览器 Chat 与 Cowork 历史尚未接入。

能力声明用于发现来源功能，具体记录是否具备数据仍以详情字段为准。来源接口和浏览器都只访问本机，应用设置与历史文件分离保存。

### 对话投影的可选字段

- `has_reasoning` 与 `thinking_text / output_text`：让过程和最终正文分别显示，避免根据 Agent 名称推断。
- `output_page`：正文在原始分页拼接内容中的起始页；只有原始分块明确时提供，不读取全部思考来寻找正文。
- `turn_started_at / turn_completed_at / turn_duration_ms / turn_status`：原生日志的整轮状态和计时。缺失时只显示状态，不把最后一条消息的请求时长当作整轮时长。
- `turn_usage`：整轮已记录请求用量的累加，与单条 `usage` 和跨轮累计 `request_cumulative_usage` 分开。
- `argument_summary`：原生工具参数中的描述、路径、命令或查询摘要。通用归一化服务仅从可解析的已有参数生成摘要；DSH 在裁剪列表预览之前提取，长正文仍按需读取。

所有来源通过同一套对话布局、过程、思考、工具、Markdown、附件和操作组件呈现。展示模式及字号存入应用自己的设置目录，旧设置缺少新增字段时沿用默认值。
