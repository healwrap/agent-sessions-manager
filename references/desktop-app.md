# Agent Sessions 桌面首版

## 使用

macOS 应用打开后自动启动随附后台，读取本机 Codex、Claude Code 和 Antigravity 历史。无需运行 Python、打开浏览器或指定端口。关闭窗口后继续在菜单栏常驻；从菜单栏或 Dock 再次打开。使用菜单栏“退出”或应用菜单退出时，结束应用自己的后台。重复打开应用聚焦已有实例。

菜单栏支持暂停同步、重启后台和可选的登录启动。登录启动默认关闭，由用户选择。窗口隐藏后不轮询或解析 Markdown；打开后继续增量读取。后台停止时显示恢复页，“重新启动”可拉起新后台。

会话按项目排列，并标注 Agent 来源。可筛选来源、切换对话/轨迹、查看事件详情、置顶、修改显示名、归档与恢复、移动到项目。管理动作保存在应用自己的 `view.json`，不修改原 Agent 记录。没有目录归属的会话进入“未分配项目”；有歧义的相同目录项目不自动合并。

## 数据能力

| 来源 | 当前读取能力 | 边界 |
| --- | --- | --- |
| Codex Desktop / CLI | 可见对话、调用、按需结果、媒体引用、压缩位置 | 保留既有引用与深链接；隐藏推理、系统载荷不展示。 |
| Claude Code | 原生 UUID 消息、当前分支、工具参数与结果 | 按 `parentUuid` 追踪当前分支；仅原生调用 ID 唯一配对时提供独立结果。实际本机文字记录已核验；工具场景通过受控 fixture 验证。附件渲染尚未实现。 |
| Antigravity 桌面 / CLI | 会话摘要、可见正文、调用参数、执行记录、错误 | 两个实例保留独立键；按步骤最新快照读取。结果按唯一原生调用 ID，或连续执行块中完全一致的 search_web 查询、view_file 文件路径与行范围关联；支持同一步并行读不同文件和同文件不同范围，不按结果顺序猜测。缺少关联依据的执行输出单独展示。只有摘要的会话保留在列表，说明未保存 transcript。未解析二进制步骤载荷，不宣称完整工具结果支持。 |

后台只监听本机回环地址，界面资源随包附送，没有 CDN 或上传历史行为。SQLite 正常使用只读连接；不能打开活动库时，核对源文件状态后复制数据库和 WAL 到临时目录读取，避免遗漏已提交记录。保留原字段值，不自动替换 URL、输入或输出。

来源统一键为 `provider:instance:native-key`。引用随原生 UUID、步骤或原有 Codex 引用保持稳定；事件正文每页 7000 字符、轨迹每页默认 150 条，滚到边缘自动补页。工具结果只在用户打开结果时读取。

侧栏底部“设置”支持 Codex、Claude Code、Antigravity、Antigravity CLI 四个数据目录、来源开关、3 至 60 秒刷新间隔与动画开关；`~` 展开为本机用户目录。新路径保存后立即重建来源，配置写入应用自己的 `settings.json`；不会创建不存在的 Agent 数据目录。

对话消息旁的剪贴板箭头图标复制本地只读指令。目标 Agent 在同一台电脑、有文件读取权限时，可执行应用自带的读取程序，按目录和引用恢复到所选消息。指令包含来源路径、会话 ID、续接位置、分页及证据读取方法；历史授权不继承。云端 Agent 不能直接访问本机文件。本功能恢复可见上下文，不搬运原 Agent 的隐藏运行状态。

macOS 使用原生 Sidebar 材质，正文区域保持独立背景。侧栏、详情、项目会话列表和对话过程使用短过渡，遵循系统“减少动态效果”和应用动画开关。时长模式按已记录调用区间的并集折叠空闲时间；圈选用区间重叠判断。缺少模型时长的来源保留点标记，不伪造计时。摘要步骤数按可见助手消息与外层调用计数，内部调用计入工具调用数；没有原生模型请求分组的来源，不宣称这是模型请求数。

侧栏搜索覆盖标题、自定义名称、项目和跨会话可见对话正文；不会把隐藏内容或工具结果纳入对话搜索。结果按原项目、来源归类。轨迹搜索覆盖当前会话可见正文、引用和参数摘要。自动交接摘要和后台目录监听暂未加入。

## 构建

在目标系统上构建，使用 Rust/Cargo、Node/npm 和 Python 3，以及该系统的 Tauri 原生开发依赖。macOS 需要 Xcode Command Line Tools，Windows 需要 MSVC 和 WebView2，Linux 需要 WebKitGTK 等原生库，参见 [Tauri 开发前置条件](https://v2.tauri.app/start/prerequisites/)。从仓库根目录运行：

```bash
npm ci
npm run desktop:build
```

脚本创建专用构建环境，将 Python 与查看器资源打包为 sidecar，再构建 Tauri 应用和普通安装镜像。运行成品无需上述开发依赖。

输出：

- `desktop/target/release/bundle/macos/Agent Sessions.app`
- `desktop/target/release/bundle/dmg/Agent Sessions_0.1.0_aarch64.dmg`（本机 Apple Silicon 构建）

包面向本机测试，尚未使用 Developer ID 签名与 Apple 公证。外部分发需另行配置发布身份；不要把本机启动成功当作分发验收。

构建脚本按宿主系统处理 Python 虚拟环境、Windows `.exe` sidecar 和安装包类型：macOS 生成 app / dmg，Windows 生成 NSIS，Linux 生成 deb / AppImage。Windows、Linux 需要在对应宿主机实际构建和验收，本机 Mac 测试不能替代它们。

系统窗口装饰默认启用，Windows 和 Linux 的窗口按钮交给系统；仅 `desktop/tauri.macos.conf.json` 启用 macOS Overlay 和原生 Sidebar 材质。Tauri 自动合并平台配置。应用目录按本机用户选择：Mac 为 `~/Library/Application Support/Agent Sessions`，Windows 优先 `%LOCALAPPDATA%/Agent Sessions`，Linux 为 `$XDG_DATA_HOME/agent-sessions` 或 `~/.local/share/agent-sessions`。Codex 遵循 `CODEX_HOME`，Claude Code 遵循 `CLAUDE_CONFIG_DIR`；其他来源默认仍在当前用户的 `.gemini` 下，可在设置中更改。Antigravity 的 file URI 兼容 Windows 盘符、UNC 网络共享和编码路径；续接命令在 Windows 使用 PowerShell 引号。

Rust 外壳：`desktop/src/main.rs`。React + TypeScript 界面：`frontend/src/`，由 Vite 与 Tailwind CSS 构建。后台：`backend/agent_sessions/`，按 API、来源适配、上下文读取和轨迹布局分包。两个 `scripts/` 命令保留为兼容入口。目录约定见根目录 `README.md`。

macOS 主窗口使用 Overlay 标题栏并隐藏原生标题文字。系统红黄绿按钮保留在侧栏顶部，网页头部提供拖动区域；收起侧栏后预留窗口按钮位置。设置采用 DSH 的固定尺寸分栏面板，仅提供本应用支持的通用设置与会话来源。

侧栏和详情展开时一次性确定布局，再以位移和透明度过渡，避免动画每帧改变正文宽度。轨迹列宽在响应式断点处立即确定，不对多行同时做宽度动画。折叠内容超过 360 像素时只做淡入，短列表保留高度过渡。滚动位置独立保存，不通知整个界面重绘；后台检查遇到同一历史版本时保持静默，新增记录和读取错误仍及时更新。动画关闭或系统减少动态效果时跳过位移动画。

## 验证

```bash
npm run build:ui
npm run test
```

来源测试涵盖同名原生 ID 隔离、Claude 分支和乱序结果关联、半行写入、记录重写、可见正文全文匹配、Antigravity 步骤更新与摘要空态、WAL 快照、原值保留与项目设置持久化。桌面验收另外检查真实窗口、关闭常驻、重复打开、后台停止恢复和退出清理。

官方实现依据：[Tauri sidecar](https://v2.tauri.app/develop/sidecar/)、[托盘](https://v2.tauri.app/learn/system-tray/)、[单实例](https://v2.tauri.app/plugin/single-instance/)、[系统剪贴板](https://v2.tauri.app/plugin/clipboard/)。
