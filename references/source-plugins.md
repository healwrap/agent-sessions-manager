# 来源插件接口

各 Agent 的原生文件格式不同，解析差异留在来源模块。目录聚合、HTTP、轨迹和详情组件不识别 Agent 名称。

## 注册

`backend/agent_sessions/sources/contract.py` 定义接口版本 1。`plugins.py` 中的 `SourcePlugin` 注册来源 ID、显示名称、工厂、路径字段、能力与历史路由别名。工厂接收配置中的路径字典，返回以下只读接口：

| 接口 | 返回内容 |
| --- | --- |
| `available()` | 来源目录是否可用 |
| `discover()` | 本地会话目录，包含稳定 ID、标题、更新时间与该 Agent 自己的项目归属 |
| `trajectory()` | 分页记录、完整导轨、折叠分组、搜索与时长投影 |
| `detail()` | 原始参数或结果、正文、原始内容块、可选 Schema / 附件 / 请求信息 |
| `focus()` | 根据完整记录解析圈选区间及跳转位置 |
| `matches_content()` | 会话标题之外的正文检索 |
| `attachment()` | 只读取所选记录实际引用的附件，不支持时返回明确错误 |

新增来源只需实现上述接口并添加注册项。`SourceRegistry` 检查接口版本、路由冲突与必需方法；设置界面的路径字段和侧栏来源下拉框直接使用注册信息。

适配器还提供 `root: Path`、`rows: dict` 和支持上下文管理的 `lock`。聚合层在目录锁内调用 `discover()`；注册时同时校验这些属性。续接命令使用统一的 `--source-path SOURCE=PATH`，保留所有注册目录（包括索引目录），不维护另一份 Agent 专用参数表。

## 公共服务和展示

`common.py` 的 `TrajectoryStore` 处理与来源无关的搜索、导轨、分页和范围定位。JSONL 来源可使用 `base.py` 的 `HistoryStore`，数据库来源可覆盖读取方法。它们不再继承 Codex 原生读取器。

标准事件包含 `ref / turn / kind / record_type / timestamp / status / position`。语义类型包括 `user_message`、`assistant_message`、`context_message`、`tool_call`、`subtool_call`、`execution_result`、`system_prompt`、`tool_definitions`、`compaction` 和 `request`。新解析器应直接填写 `record_type`；旧记录的兼容转换集中在 `common.py` 与前端 `record-presentation.ts`。

所有来源共用消息概述、工具概述、Markdown、内容块、JSON 树、Schema、计时、工具跳转、附件及请求组件。可选字段决定是否展示相应元素：

- `thinking_text / output_text / tool_calls`：思考折叠、正文和关联工具入口。
- `source_blocks`：按原始顺序展示内容块；工具块的 `ref` 必须是可验证的对应调用。
- `tool_schema`：调用发生时的原生定义，不能套用今天的定义。
- `request_number / request_config / usage`：请求入口、选项和记录下来的用量。
- `attachments`：附件引用与预览；不要求其他来源使用 DSH 的存储方式。
- `code_program`：明确记录的可回放源码及语言提示，按通用代码视图展示。

缺失数据保持缺失，不估算首 token 时间、用量、请求次数或独立结果。原始值不得替换；长正文按页读取，原始块按需加载。

## 兼容边界

Claude 桌面索引与 CLI 正文的合并和去重在 `claude_source.py` 内完成。旧 `claude:desktop` 链接通过插件声明的别名路由读取，会话名称、收藏及归档 ID 保持兼容。旧无来源前缀的 Codex UUID 在目录路由边界兼容，其他读取器不借用 Codex 的项目身份。

能力声明用于发现来源功能，具体记录是否具备数据仍以详情字段为准。来源接口和浏览器都只访问本机，应用设置与历史文件分离保存。
