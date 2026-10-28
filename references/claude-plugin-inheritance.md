# Claude App 本机插件继承

App 环境编辑器提供「继承本机插件」开关，新环境和已有环境默认开启。与 skills 继承分别设置，更改后在下一次启动受管 Claude App 时应用，并在之后的 Code 会话中加载。

## 目录与配置

- 来源为本机 `~/.claude/plugins/installed_plugins.json` 中 `scope=user` 且位于程序缓存的安装记录。项目级插件、账号同步目录、凭据和 `pluginConfigs` 不复制。
- 程序存入应用自己的 `claude-app/plugin-library/packages/`，按插件版本、源文件状态和适配修订建立快照。一个插件更新时只创建它的新快照。
- `plugin-library/seeds/` 以本地 marketplace 和 cache 目录组合固定版本。市场内程序使用文件硬链接复用快照，满足 Claude 对相对来源路径的目录限制；cache 使用目录链接或 Windows 目录联接。启动前登记本应用管理的市场，避免首次查询缺少插件。
- 每个账号继续使用独立 `claude-code/settings.json` 和 `claude-code/plugins/data/`。只为尚无设置的继承插件填入本机默认启用值，保留账号已有的启用状态、配置及独立安装。
- `CLAUDE_CODE_PLUGIN_SEED_DIR` 指向共享快照，`CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` 等待首次加载；`CLAUDE_SECURESTORAGE_CONFIG_DIR` 明确指向当前账号的 Code 配置目录。
- 停用继承时记录该账号的继承插件选择，并停用这些入口；重新开启时恢复。账号自己的插件安装、登录和插件数据继续保留。

## 单独适配

适配只作用于应用保存的程序快照，本机插件源文件保持原样。

- `eden-ops`：会话采样使用当前 `CLAUDE_CONFIG_DIR/projects`，路径探测支持当前配置和共享 seed，日志 hook 通过 Bash 执行，避免修改共享程序权限。
- `eden-dev`：`send.sh` 本地日志和 auto-dev 指标文件改用当前账号的插件数据目录。

继承保留插件原有的 skills、hooks 和 MCP 服务；开关控制整个插件继承集合。在 Claude Code 的插件管理中调整单个插件，只改变当前账号。插件仍可能访问自己约定的外部服务或全局业务目录，例如 Eden 的团队上下文、EHC 工作流状态和 SSO；这些目录并不因此成为 Claude 账号的独立数据。本功能不迁移这些服务的登录身份。

## 验证

验证使用临时来源和账号配置，覆盖双账号数据与启用状态、停用及恢复、本机新增/移除插件、账号独立安装优先、固定快照更新及只读运行。真实插件加载通过本机模拟 API 验证，避免执行真实运维流程。正式 Claude App 的环境传递与新 Code 会话加载另行检查。
