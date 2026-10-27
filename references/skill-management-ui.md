# Skill 安装管理

## 已接入的功能

管理本应用提供的 `agent-sessions` Skill。页面通过 `/api/skills` 读取真实目录、符号链接、安装清单、文件摘要与操作记录，没有示例安装状态。

- 支持跟随应用的链接安装、完整独立副本、更新、失效链接修复、路径配置、卸载和恢复原入口。
- 各项执行前生成真实操作计划，列出安装路径、需要保留的备份，以及共享目录涉及的其他入口。
- 操作后重新读取安装文件；批量操作逐项返回结果，同一物理入口只执行一次。
- 更新或卸载已有入口时，将原目录或链接保存在应用数据目录的 `skills/backups/`，不删除链接指向的源文件。操作记录可恢复最近的原入口；若入口已被其他操作改变，会要求先重新检查。
- 本地自定义内容按安装清单检测，更新前可查看变化文件。外部安装没有版本清单时显示「外部安装」，不猜测旧版本。
- 文件可读取与 Agent 已加载分别表达。安装完成后，在对应 Agent 的新会话中验证加载。

## 安装目标与来源

| 入口 | 用户级位置与行为 |
| --- | --- |
| Codex | 保留已有 `$CODEX_HOME/skills/agent-sessions` 或 `~/.codex/skills/agent-sessions` 入口；新用户使用官方共享目录。 |
| Claude Code | `$CLAUDE_CONFIG_DIR/skills/agent-sessions`，未配置时为 `~/.claude/skills/agent-sessions`。只用于本机 Code 会话，不冒充 Claude Cowork 或云端账号 Skill。 |
| Cursor | 专用入口为 `~/.cursor/skills/agent-sessions`。没有专用入口但共享 Skill 存在时显示「共享可用」。 |
| Antigravity IDE | `~/.gemini/config/skills/agent-sessions`，与 CLI 分开管理。 |
| Antigravity CLI | `~/.gemini/antigravity-cli/skills/agent-sessions`。 |
| DeepSeek Harness | 根据当前客户端配置填写实际 Skill 入口；未确认路径时显示「待配置」，不假定 `.dsh/skills` 一定生效。 |
| 共享 Skill | `~/.agents/skills/agent-sessions`。通过父目录的真实映射识别共用入口；操作计划显示受影响的消费者。 |

目录依据：[OpenAI 官方 Skill 文档](https://learn.chatgpt.com/docs/build-skills)、[Claude Code](https://code.claude.com/docs/en/skills)、[Cursor](https://cursor.com/docs/skills)、[Antigravity](https://antigravity.google/docs/skills)。Codex 的既有开发入口同时参考当前安装环境与 Skill Installer 约定。

用户自定义入口保存在应用自己的 `skills/settings.json` 中，只允许指向名为 `agent-sessions` 的完整入口，不改 Agent 的其他设置或历史会话。

## 稳定来源与打包

`SkillPayload` 将完整的 `SKILL.md`、说明、引用资料、后端读取代码与标准库启动脚本复制到应用管理的不可变版本目录。`skills/current` 指向当前版本，跟随应用的安装入口链接到它；独立副本保留自己的版本。

桌面构建先生成 `build/skill-payload`，将它与 Python sidecar 一起打包。安装后的两个脚本调用 sidecar，Codex 上下文入口通过 `--skill-context` 分派；无需从开发仓库导入 Python 包。源码调试使用当前解释器和版本目录内的完整代码。

API：`GET /api/skills`、`POST /api/skills/plan`、`POST /api/skills/apply`、`POST /api/skills/restore`。计划有十分钟有效期，并绑定源版本、目录映射与入口指纹；执行前变化会要求重新生成计划。

开发预览可用 `AGENT_SESSIONS_API_URL` 指定后端。调试服务器的 `--skill-state-home` 允许将 Skill 数据与临时浏览器验收状态分开；默认与应用数据目录一致。

## 本轮验收

已在隔离目录实际执行链接与副本安装、修改检测、备份更新、卸载恢复、失效链接修复、共享入口合并、过期计划拒绝和批量部分失败。也已通过应用页面在本机 Claude Code 的真实 Skill 目录完成一次安装，读回应用托管来源，并从仓库外运行两个已安装的 CLI 脚本。

使用现有工作区布局、Agent 图标、按钮、状态标签、搜索、选择器、弹窗与 Markdown 组件。
