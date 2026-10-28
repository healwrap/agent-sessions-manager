<div align="center">
  <img src="docs/media/logo.svg" width="104" alt="Agent Sessions 图标">
  <h1>Agent Sessions</h1>
  <p><strong>简体中文</strong> · <a href="README.en.md">English</a></p>
  <p><strong>所有 Agent 会话，一处管理。</strong></p>
  <p>把散落在不同工具里的对话与工作轨迹，带回同一个项目。</p>
  <p>本机读取 · 历史只读 · 按需接力</p>
</div>

## 30 秒认识 Agent Sessions

![Agent Sessions 横版宣传片封面](docs/media/promo-cover.png)

<details>
<summary>▶ 展开并播放 30 秒宣传片</summary>

https://github.com/user-attachments/assets/c2cfc3a9-45bc-493d-b858-1181e6496db1

</details>

30 秒 · 1920 × 1080 · 含配乐 · [下载 MP4](https://github.com/healwrap/agent-sessions-manager/raw/refs/heads/main/docs/media/agent-sessions-landscape.mp4)

> 视频与截图展示当前界面，所有会话内容均为虚构演示数据。截图原图为 2560 × 1440，可点击查看。

## 不必再到处翻会话

一个项目用 Codex 写代码，用 Claude Code 查问题，再用 Cursor 调整界面。工作还在继续，会话却留在了不同的工具里。

Agent Sessions 是一个本地会话管理应用：把不同来源放进同一套项目列表，回看对话、检查执行过程，或把相关历史作为下一段任务的上下文。

| 想做的事 | 在这里怎么做 |
| --- | --- |
| 找回某次讨论 | 按项目和来源浏览，搜索标题、项目与可见对话正文 |
| 读懂长对话 | Markdown、代码高亮、表格、可用图片预览，按需展开工作过程 |
| 弄清 Agent 做了什么 | 在对话与轨迹间切换，查看工具参数、结果和原文详情 |
| 跟上正在进行的工作 | 增量同步原 Agent 已写入本地历史的消息与工具记录 |
| 换个 Agent 接着做 | 复制整个会话，或从某条消息开始的上下文引用 |
| 整理自己的工作区 | 置顶、重命名、归档与项目归属保存在应用设置中 |

## 看见对话，也看见过程

### 会话按项目归位

在一个侧栏里查看多个来源，保留每段会话的来源标识。对话支持代码块、表格和折叠过程，回看时少一些翻找。

[![深色对话界面：项目归组、Markdown 表格和代码块](docs/media/conversation-dark.png)](docs/media/conversation-dark.png)

### 每一步都有迹可循

轨迹视图将消息与工具记录放到同一条时间线上。选中记录查看参数和结果，也能从对话中的消息跳回对应位置。

[![轨迹界面：时间线、工具记录及执行详情](docs/media/trajectory-dark.png)](docs/media/trajectory-dark.png)

### 按自己的习惯阅读

浅色、深色或跟随系统，调整内容字号与工作步骤展示。设置自动保存，无需再点保存按钮。

| 浅色对话 | 通用设置 |
| :---: | :---: |
| [![浅色对话界面](docs/media/conversation-light.png)](docs/media/conversation-light.png) | [![自动保存的通用设置](docs/media/settings-dark.png)](docs/media/settings-dark.png) |

## 上下文接力，少一次重新交代

1. 在会话菜单中选择 **复制上下文引用**，引用整个会话；也可使用消息旁的同名按钮，从那条消息开始引用。
2. 把引用粘贴给下一段任务中的 Agent，并说明这次要继续做什么。
3. 目标 Agent 按目录、原文与工具证据读取所需内容，继续眼前的任务。

引用使用本地只读命令，目标 Agent 需要能访问同一台电脑的历史文件。它提供历史参考，不会迁移 Agent 的运行状态，也不会继承历史任务中的授权。详细用法见 [上下文读取与恢复](references/context-recovery.md)。

## 账号、环境与组件管理

开始页可进入会话管理、账号与环境管理和 Skill 管理，侧栏底部可随时切换工作区，各工作区共用全局设置入口。

- **账号与独立环境**：每个账号分别绑定浏览器和 Claude App 数据目录，保留登录状态、启动检查、设备标识隔离和账号归属校验。Claude 网页支持导入仍有效的 sessionKey；App 使用官方登录引导。见 [账号与独立环境](references/account-environments.md)。
- **专用代理**：添加已有 HTTP / SOCKS 地址，或导入订阅、Clash 配置并选择节点。应用管理独立 Mihomo，提供启停、订阅自动更新、只读查看及网络检测弹窗，不修改系统代理。见 [创建与管理专用代理](references/dedicated-proxies.md)。
- **组件管理**：按需安装、检查更新和卸载 Fingerprint Chromium、Mihomo 与官方 Claude App，账号数据与程序文件分开保存。Windows / macOS 的支持范围和验收状态见 [平台与组件管理](references/runtime-components.md)。
- **Skill 管理**：读取本机安装入口，支持链接安装、独立副本、更新、失效链接修复、卸载及恢复备份。Claude App 环境可继承本机 skills 与插件。见 [Skill 安装管理](references/skill-management-ui.md)。

运行时的连接采样用于发现异常并停止环境，尚不等同于系统级网络阻断；代理预检也不能代替 App、Code 和 Cowork 全链路验收。

## 支持的来源

| 来源 | 当前接入范围 |
| --- | --- |
| Codex | Desktop / CLI 的本地会话、可见对话、工具记录与可用附件 |
| Claude Code | 桌面端与 CLI 的共享会话正文，合并展示，按当前分支读取 |
| Cursor | 桌面端本地 Agent / Composer 会话数据库 |
| Antigravity Desktop | 本地会话摘要、已保存正文与可用执行记录 |
| Antigravity CLI | 独立于桌面端的本地会话来源 |
| DeepSeek Harness | 本地 JSONL 与 Zstandard 压缩日志、工作过程和工具记录 |

默认发现各来源的常用目录，也可在设置中修改。不同 Agent 保存的内容不同，展示能力以本地记录为准；仅有摘要或缺少正文时会明确显示空态。具体格式、附件支持与读取边界见 [桌面应用与来源说明](references/desktop-app.md)。

## 数据留在本机

- 历史文件只读，保留原始字段，不改写原 Agent 的会话。
- 名称、归档、项目整理和偏好设置单独保存。
- 界面与后台在本机运行，服务只监听回环地址，读取历史无需上传对话。
- 长会话分页加载，工具结果按需读取；实时同步覆盖已经写入本地记录的内容。

## 开始使用

### 本地运行

需要 **Node.js 22.12+** 与 **Python 3.10+**。

```bash
git clone --branch main https://github.com/healwrap/agent-sessions-manager.git
cd agent-sessions-manager
npm ci
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm run build:ui
python scripts/trajectory_server.py --port 8766
```

打开 [http://127.0.0.1:8766](http://127.0.0.1:8766)。Windows PowerShell 使用 `.venv\Scripts\Activate.ps1` 激活环境。

### 更新另一台电脑的源码

所有功能统一合入 `main`。在已有克隆中先切到并更新主分支，再重新安装依赖和构建：

```bash
git fetch --prune origin
git switch main
git pull --ff-only origin main
npm ci
npm run desktop:build
```

### 构建桌面应用

安装目标系统的 [Tauri 构建依赖](https://v2.tauri.app/start/prerequisites/)，以及 Rust/Cargo、Node.js 和 Python 后，在仓库根目录运行：

```bash
npm ci
npm run desktop:build
```

桌面包自带后台，运行成品无需单独启动 Python 或浏览器。macOS 已在本机构建和运行；Windows、Linux 需在对应系统构建与验收。安装包尚未配置正式分发签名，构建产物与使用细节见 [桌面应用说明](references/desktop-app.md#构建)。

### 给 Agent 按需读取历史

仓库还提供 [Agent Sessions Skill](SKILL.md) 与上下文读取 CLI。只使用读取入口时无需构建前端；Codex 专用恢复流程见 [上下文读取与恢复](references/context-recovery.md)。

## 开发与贡献

前端使用 React、TypeScript、Vite 与 Tailwind CSS；后台使用 Python；桌面外壳使用 Tauri。新增来源通过统一插件接口接入。

- [项目结构、开发命令与校验](references/development.md)
- [来源插件接口](references/source-plugins.md)
- [对话与轨迹展示约定](references/trajectory-ui.md)
- [反馈问题与建议](https://github.com/healwrap/agent-sessions-manager/issues)

提交问题或界面截图时，请使用演示记录或先去除个人对话与凭据。

## 致谢

部分界面与轨迹样式参考 DeepSeek Harness，相关 MIT 许可保留在 [harness-license.txt](frontend/public/harness-license.txt)。其他依赖与图标的许可随源码保留。宣传媒体使用的素材、字体及制作说明见 [媒体说明](docs/media/README.md)。
