<div align="center">
  <img src="docs/media/logo.png" width="104" alt="Agent Sessions 图标">
  <h1>Agent Sessions</h1>
  <p><strong>简体中文</strong> · <a href="README.en.md">English</a></p>
  <p><strong>会话与账号，一处管理。</strong></p>
  <p>一个本地 AI 工作台：回看 Agent 的工作，整理账号与独立环境。</p>
  <p>会话管理 · 账号管理 · Skill 安装管理</p>
</div>

[![账号管理：Claude / Codex 账号列表、独立浏览器和 Claude App 环境](docs/media/account-workspace.jpg)](docs/media/account-workspace.jpg)

> 当前账号管理界面，使用虚构的账号、环境与代理配置演示。点击截图查看原图。

Agent Sessions 的重点是两个工作区：**会话管理**和**账号管理**。前者把不同 Agent 的本地对话与工具轨迹整理到一起；后者把 Claude / Codex 账号及其独立运行环境放到同一个入口。另有 Skill 管理工作区，用于安装和维护随应用提供的 `agent-sessions` Skill。

| 工作区 | 你可以做什么 |
| --- | --- |
| **会话管理** | 按项目回看多个 Agent 的对话、搜索历史、检查工具轨迹，并复制上下文引用 |
| **账号管理** | 整理 Claude / Codex 账号，绑定独立浏览器或 Claude App 环境，配置专用代理并查看运行状态 |
| Skill 管理 | 将 `agent-sessions` Skill 安装到本机 Agent，管理更新、链接、备份与恢复 |

从开始页进入工作区，也可通过侧栏底部切换；设置入口在各工作区共用。

## 会话管理：找回讨论，看清过程

一个项目可能同时用到 Codex、Claude Code 和 Cursor。会话管理把各来源保留在同一套项目列表里，继续使用原 Agent 的历史文件。

- **项目与搜索**：按项目、来源浏览，搜索会话标题、项目与可见对话正文。
- **对话与轨迹**：阅读 Markdown、代码、表格与可用图片；切换到时间线，查看工具参数、结果和原始记录。
- **持续同步**：跟进原 Agent 已经写入本地历史的消息和工具记录；长内容分页读取。
- **整理与接力**：置顶、重命名、归档、调整项目归属，复制整个会话或从某条消息开始的上下文引用。

### 支持的会话来源

| 来源 | 当前读取范围 |
| --- | --- |
| Codex Desktop / CLI | 本地会话、可见对话、工具记录与可用附件；区分非交互 exec 任务和子代理 |
| Claude Code | 桌面端与 CLI 的共享会话正文，合并展示，按当前分支读取 |
| Cursor | 桌面端本地 Agent / Composer 会话数据库 |
| Antigravity Desktop | 本地会话摘要、已保存正文与可用执行记录 |
| Antigravity CLI | 独立于桌面端的本地会话来源 |
| DeepSeek Harness | 本地 JSONL / Zstandard 压缩日志、工作过程和工具记录 |

不同 Agent 保存的内容不同，展示能力以实际记录为准。默认发现常用目录，也可在设置中修改。格式与读取边界见 [桌面应用与来源说明](references/desktop-app.md)。

上下文引用可以交给下一段 Agent 任务，按目录、原文与工具证据读取所需历史。接收方需要能访问同机文件；引用提供历史参考，不迁移运行状态，也不继承历史任务的授权。详见 [上下文读取与恢复](references/context-recovery.md)。

<details>
<summary>查看会话界面示例</summary>

[![会话界面示例：项目列表、Markdown 与代码块](docs/media/conversation-dark.png)](docs/media/conversation-dark.png)

</details>

## 账号管理：账号与环境对应起来

为 Claude / Codex 账号配置独立浏览器；Claude 账号还可以绑定官方 **Claude App** 环境。在账号详情中切换使用方式，查看运行与登录凭据状态，再打开对应窗口。

- **账号与环境分开整理**：为账号绑定浏览器、Claude App 环境，分别保存独立数据目录、语言、时区与代理配置。
- **启动与切换**：从账号入口打开、切回或停止对应环境；运行中的环境保留自己的登录状态与配置。
- **专用代理**：添加 HTTP / SOCKS 地址，或导入订阅、Clash 配置并选择节点。应用管理独立 Mihomo 进程，不修改系统代理。
- **按需检查**：查看代理、出口和环境检查结果；浏览器检测与 App 检查分别展示，按已配置规则进行启动预检。
- **组件管理**：在设置中安装、更新和卸载 Fingerprint Chromium、Mihomo 与官方 Claude App。组件按需下载，环境配置与程序文件分开保存。

账号登录使用对应服务的官方流程。平台支持、隔离范围、登录与检测的实际验收情况见：

- [账号与独立环境](references/account-environments.md)
- [专用代理配置](references/dedicated-proxies.md)
- [平台与组件管理](references/runtime-components.md)
- [Claude App 的本机 Skill 与插件继承](references/claude-plugin-inheritance.md)

## Skill 管理：维护本机安装入口

当前管理的安装对象是随应用提供的 **`agent-sessions` Skill**，用于让 Agent 按引用读取本地历史。可部署到 Codex、Claude Code、Cursor、Antigravity 等已支持的本机入口，提供链接安装、独立副本、更新、失效链接修复、卸载与备份恢复。

操作前展示真实路径和变更计划，完成后重新读取安装文件；共享入口会标明受影响的消费者。安装文件可用与 Agent 已加载分别表达，安装后需在对应 Agent 的新会话中确认。详见 [Skill 安装管理](references/skill-management-ui.md)。

## 本地数据与运行边界

- 原 Agent 历史只读；名称、归档、项目整理与阅读偏好单独保存。
- 账号与环境配置、独立数据目录保存在本机。读取会话无需上传历史；账号登录、组件下载与按需网络检测会连接相应服务。
- 界面与后台在本机运行，服务只监听回环地址。
- 运行时连接采样用于发现异常并停止环境，不等同于系统级网络阻断；具体覆盖范围以各平台的实际验收为准。

## 开始使用

### 构建桌面应用

需要 **Node.js 22.12+、Python 3.10+、Rust / Cargo**，以及目标系统的 [Tauri 构建依赖](https://v2.tauri.app/start/prerequisites/)。

```bash
git clone --branch main https://github.com/healwrap/agent-sessions-manager.git
cd agent-sessions-manager
npm ci
npm run desktop:build
```

安装包包含界面与 Python 后台，成品无需另起服务。macOS 构建输出：

- `desktop/target/release/bundle/macos/Agent Sessions.app`
- `desktop/target/release/bundle/dmg/Agent Sessions_0.1.0_aarch64.dmg`（Apple Silicon）

macOS 已在本机构建和运行；Windows / Linux 需在对应系统构建与验收。正式分发签名与公证尚未配置。详见 [桌面构建说明](references/desktop-app.md#构建)。

<details>
<summary>以本地网页方式运行</summary>

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm ci
npm run build:ui
python scripts/trajectory_server.py --port 8766
```

打开 [http://127.0.0.1:8766](http://127.0.0.1:8766)。Windows PowerShell 使用 `.venv\Scripts\Activate.ps1` 激活环境。原生窗口、默认程序打开链接等能力需要桌面版。

</details>

### 更新源码

保留自己的本地改动后，在克隆目录更新 `main` 并重新构建：

```bash
git switch main
git pull --ff-only origin main
npm ci
npm run desktop:build
```

## 会话功能视频

沿用早期版本的 30 秒宣传片，演示会话浏览、工具轨迹与上下文接力。账号与 Skill 管理请参考上方说明及当前界面。

<details>
<summary>▶ 展开并播放会话功能演示</summary>

https://github.com/user-attachments/assets/c2cfc3a9-45bc-493d-b858-1181e6496db1

30 秒 · 1920 × 1080 · 含配乐 · [下载 MP4](https://github.com/healwrap/agent-sessions-manager/raw/refs/heads/main/docs/media/agent-sessions-landscape.mp4)

</details>

## 开发与贡献

React、TypeScript、Vite、Tailwind CSS 前端，Python 后台，Tauri 桌面外壳。来源通过统一插件接口接入，管理页面复用公共 UI 组件。

- [项目结构、开发命令与校验](references/development.md)
- [来源插件接口](references/source-plugins.md)
- [对话与轨迹展示约定](references/trajectory-ui.md)
- [反馈问题与建议](https://github.com/healwrap/agent-sessions-manager/issues)

提交问题或截图时，请使用演示数据或先移除个人会话与凭据。

## 致谢

部分界面与轨迹样式参考 DeepSeek Harness，MIT 许可保留在 [harness-license.txt](frontend/public/harness-license.txt)。其他依赖、第三方图标的许可与来源随源码保留。应用图标与宣传素材说明见 [媒体说明](docs/media/README.md)。
