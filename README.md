# Agent Sessions Manager

用于管理本机 Codex、Claude Code、Cursor、Antigravity、Antigravity CLI、DeepSeek Harness 会话的桌面应用与 Skill。Claude Code 桌面端与 CLI 共用会话正文，在界面中合并展示。Cursor 读取桌面端本地 Agent / Composer 会话数据库。提供项目会话列表、对话、工具轨迹和按需恢复入口。历史文件保持只读，应用整理设置独立保存。

开始页仅在启动时展示，选择进入「会话管理」「账号与环境管理」或「Skill 管理」。工作区通过侧栏底部按钮直接切换；侧栏收起时，切换按钮显示在顶栏。切换保留会话、筛选和检测结果，并暂停会话同步。会话目录在首次进入会话管理时加载，原有会话引用链接仍可直接进入。

「Skill 管理」读取本机真实安装入口，支持链接安装、独立副本、更新、失效链接修复、路径配置、卸载及恢复备份。每次操作先生成包含目标路径和共享影响的计划，确认执行后重新读取文件状态。现有开发目录链接与应用托管来源分别显示；共享目录提供的能力标记为「共享可用」。内置 Skill 包含完整说明与运行入口，桌面安装版通过自己的 sidecar 执行读取命令，不依赖开发仓库。使用说明见 [Skill 安装管理](references/skill-management-ui.md)。

账号环境工作区以「账号管理」为入口，添加 Claude / Codex 账号时可同时创建独立浏览器环境、Claude App 环境和专用代理，也能绑定已有环境。每个环境绑定一个账号，浏览器与 App 的登录状态分别保存；首次打开后在官方界面完成登录，以后直接打开或切换到对应环境。界面显示本地登录 Cookie 是否已保存，不据此代替服务端验证账号身份。

Claude 账号的「独立浏览器」支持 sessionKey 登录：粘贴原始值、`sessionKey=完整值` 或 `邮箱----邮箱密码----sessionKey=完整值`，通过绑定环境的启动检查后导入 Cookie，再使用该浏览器的网络连接核对 Claude 服务端账号邮箱。邮箱密码不参与登录，sessionKey 不写入账号配置或导入任务结果。遇到网站验证时在浏览器中完成；此入口只登录网页版，App 登录仍使用原有引导。

验证会话导入应使用仍有效的 key 与未登录的浏览器环境。Claude 的「Log out」会结束当前会话，退出后不能期待同一个 key 再次登录；服务端返回 `account_session_invalid` 时显示会话失效，不据此判断账号封禁。

Claude App 环境默认开启「继承本机 skills」：启动时将 `~/.claude/skills/` 中带 `SKILL.md` 的本机技能逐项链接到该账号独立的 Code 配置目录，已有同名本地技能优先保留。技能内容更新直接通过链接生效；新增或移除的技能在下次启动时同步。账号同步的 `synced/`、插件状态、凭据、设备标识与历史记录保持独立。关闭开关后，下次启动只移除应用创建的技能链接。

浏览器可选择本机 Google Chrome 或由 Agent Sessions 下载、校验 SHA-256 并安装的 Fingerprint Chromium。后者使用固定指纹种子，普通 Chrome 使用原生设备指纹。两者均使用独立数据目录和专用 HTTP / HTTPS / SOCKS5 代理，支持代理认证；语言、时区可手动设置或跟随出口定位。管理连接仅使用应用自有数据目录的回环 DevTools 端口，普通 Chrome 在新页面执行前应用区域设置。账号入口打开或聚焦对应网站，停止时先让浏览器保存数据并退出。运行记录持久化；管理器意外中断后按独立目录核对遗留进程，重新打开时恢复环境。macOS 首次启动如有钥匙串授权，需在系统弹窗中处理。

Claude App 环境直接启动本机官方客户端，使用独立 `--user-data-dir` 保存 App 登录数据，独立 `CLAUDE_CONFIG_DIR` 保存内嵌 Code 配置，并为该进程单独指定代理及区域设置。一次使用一个由 Agent Sessions 管理的 App 环境，切换账号前先退出旧环境；遇到用户自行打开的 Claude App 时提示先退出。官方 App 的 OAuth 授权使用系统授权服务或默认浏览器，和独立浏览器中的登录态分别保存。不会调用外部账号切换器，也不修改官方 App 包。

「启动门控」按环境保存，各项可设为「强制拦截 / 仅提醒 / 关闭」。浏览器先预检代理与出口，再在自己的本地检测页采样；强制项失败或未验证都会拦截，提醒项记录后继续，关闭项跳过对应检查。检查前本地转发器只放行 Cloudflare / IPify 与 BrowserLeaks 随机 DNS 探针，通过后进入账号网站。预检与浏览器实测使用同一出口探针，IP 可固定为指定值，留空则与预检比较；指纹稳定性比较相同种子的 Canvas 基线。DNS 探针返回目标浏览器实际使用的解析器，配置预期 DNS 后才能核对列表；没有预期值或 WebRTC 公网候选时标为未验证。出口定位先查询 IPwho.is，失败后查询 IPinfo；地理资料按实际出口 IP 缓存 5 分钟，每次启动仍重新测量出口。官方 App 使用自己的预检和数据目录检查，不共用浏览器指纹检测。

## 项目结构

源码目录为 `agent-sessions-manager/`，Skill 安装入口仍为 `agent-sessions`，应用名仍为 Agent Sessions。

```text
SKILL.md                         Skill 入口与读取边界
agents/openai.yaml               Skill 显示信息
references/                      按需加载的恢复、查看器与桌面说明
frontend/
  src/workspace.tsx              启动页与工作区切换
  src/app.tsx                    会话页面组合
  src/components/                项目侧栏、聊天、时间线、详情、设置
  src/state/                     会话状态、目录、分页读取与导航请求控制
  src/hooks/                     状态订阅、自动同步与滚动分页
  src/lib/                       API、类型、纯数据投影
  src/styles/                    Tailwind 入口、主题变量与侧栏、聊天、轨迹、设置分区样式
  public/                        图标与第三方许可证
backend/agent_sessions/
  api/                           本机 HTTP API 与静态资源服务
  sources/                       来源插件注册、统一接口与各原生格式解析
  context/                       定位、索引、原话、证据、CLI 与上下文引用
  trajectory/                    执行时长投影、折叠摘要与圈选定位
  settings.py                    独立应用设置
  environments.py                账号、环境、代理配置与本机应用发现
  browser/                       浏览器内核、代理转发、出口定位与启动门控
scripts/                         两个稳定的命令行兼容入口
  session_context.py
  trajectory_server.py
desktop/                         Tauri 外壳、启动页、原生能力与图标
tools/                           桌面打包与后台测试运行器
tests/backend/                   Python 格式、读取、来源与 HTTP 回归
tests/frontend/                  Vitest 状态、导航、显示投影与 API 回归
```

前端使用 React、TypeScript、Vite、Tailwind CSS 和 Lucide。React 管理界面与交互，纯投影函数决定聊天正文和折叠摘要；状态层处理版本、请求竞争和分页，组件不读取历史文件。DSH 的 MIT 轨迹样式按职责保存在 `src/styles/dsh/`，仅保留本应用使用的规则，应用布局和过渡使用 Tailwind 与相应组件样式。

后台是 Python 包，DSH 压缩日志使用 `zstandard`，依赖固定在 `requirements.txt`。来源适配器将各 Agent 的原生记录映射为稳定引用，HTTP 层负责接口和资源，不混入前端模板。Tauri 管理窗口、常驻菜单、剪贴板和 sidecar 生命周期。构建输出不纳入源码版本控制。

## Claude 检测

在「账号与环境管理 → 环境检测」直接选择检测对象并查看结果。网络、浏览器与 Claude App 复用结果组件，分别采样：网络检测由后台使用系统路由或显式代理发起，浏览器检测在实际使用的独立浏览器中采样并回传，App 检测读取真实安装信息、App 进程与配置继承。App 页的「检查 App 环境」直接进入 App 对象，代理列表的「检测」进入网络对象并带入代理地址。浏览器页选择已保存的独立环境后，点击「打开环境并检测」自动启动对应环境，通过原有启动门控后打开完整检测页；运行中的环境直接打开新的检测标签，保留原进程、数据目录和登录状态。启动拦截、关闭浏览器或采样超时会在管理页显示具体原因。外部 SunBrowser、CCBaga 或 Chrome 仍可生成 15 分钟有效的一次性链接，手动放入目标环境打开。Claude / Cloudflare 出口、语言、时区、Canvas / WebGL 与 WebRTC 均由该浏览器采样；管理窗口只接收结果。结果显示采样时间与语言、时区配置对比；按出口自动定位的设置使用本次启动解析值。检测票据与结果仅在本次后台进程内保存。

网络检测分别取得 Claude、Cloudflare 域名出口、Claude 网页与 Anthropic API 的无认证传输、IPv6 出口、IP 地理库属性和本机网络配置。系统路由忽略 HTTP / PAC / 环境变量代理，仍遵循操作系统的 VPN / TUN 路由；显式代理仅作用于本次后台探测。「仅 IP 资料走代理」保留系统路由测得的出口，只让 Net.Coffee / IPinfo 查询使用指定代理，结果标注资料查询链路。临时连接失败沿同一路由重试一次；超时区分建连、TLS 握手、等待响应与接收响应。Claude 网页的 Cloudflare challenge 标注为需浏览器验证；无 IPv6 路由时跳过公网请求，HTTP / SOCKS 代理端的 IPv6 单独标为待验证。

网络探测依赖本机 `curl`，请求固定的 Claude / Cloudflare / IPify 地址，并向地理库查询取得的出口 IP。HTTP 401 表示未认证的 API 已到达；Cloudflare challenge 提示需浏览器验证，其余 403 保留访问受限。语言、时区、UA、WebGL、Canvas、DNS 与 WebRTC 均来自独立浏览器；WebRTC 使用 Google STUN，DNS 使用 BrowserLeaks 随机域名的权威观测。检测页另保存本机域名的 Cookie / Local Storage 标记，用于核对不同 Profile 与重开后的存储状态。浏览器域名出口、后台网络检测与官方 App 预检分别标注来源；ASN 不用于推断住宅属性或计算可信评分。

完整需求、操作流程及验收记录见 [账号与独立环境](references/account-environments.md)。

IP 信誉直接使用 [Net.Coffee IP 详情页](https://ip.net.coffee/ip/66.167.9.194)当前使用的 `/api/ip/lookup/{ip}` 接口，显式查询实测的 Claude 出口 IP。沿用来源的信任分（0–100，越高越好）、住宅／商业／无线／机房分类、代理／VPN／Tor／爬虫／滥用标记与地理资料，保留原网页链接。接口目前无需 Key，失败或限流显示未完成；来源分数不称为 Claude 官方账号评分。内存缓存最多 128 个 IP、每项 5 分钟，退出后台后清空。结果采用出口卡片、信任刻度条、属性列表与状态标签展示，详细网络明细可展开。

最近 30 次出口记录保存在应用数据目录的 `diagnostics/claude-history.json`，可在面板清除。代理凭据仅交给本次请求，不保存到历史或进程参数。检测模块独立位于 `backend/agent_sessions/diagnostics/`，会话来源保持只读。页面分类参考 [Net.Coffee Claude 检测](https://ip.net.coffee/claude/)。IP 属性与评分沿用其查询接口，网络与窗口采样由本应用独立发起。

## 持续同步

应用自动跟进已写入本地历史的消息、工具结果与轮次状态。正在工作的会话每 750 毫秒检查来源的轻量版本标记，只有记录变化才更新正文和轨迹；闲置检查沿用设置中的同步间隔。桌面窗口在后台仍可同步，关闭到状态栏或暂停同步时停止检查。

对话处于底部时跟随新增内容；向上阅读时保持位置，已手动展开的正文页数会保留。长输出继续按页读取。实时同步的范围取决于原 Agent 保存的数据：没有写入会话文件的逐字生成内容或进程输出，不会被历史读取器凭空补齐。

## 开发

需要 Node 22.12+（或兼容 Vite 的更新版本）与 Python 3.10+。从根目录运行：

```bash
npm ci
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python3 scripts/trajectory_server.py --port 8766
```

桌面端与网页端统一使用 `http://127.0.0.1:8766/` 和应用自己的状态目录；桌面端会复用已启动的兼容后台，避免分别管理同一批环境。

Windows 使用 `.venv\Scripts\Activate.ps1` 激活环境。另一个终端运行 `npm run dev`。Vite 的界面和 API 代理仅绑定回环地址；桌面和正式本地服务使用构建后的静态资源：

```bash
npm run build:ui
python3 scripts/trajectory_server.py --port 8766
```

如果只使用上下文恢复 CLI，无需安装 Node 或构建前端；Codex 专用恢复不依赖 `zstandard`。既有 `scripts/session_context.py` 命令与 `scripts/trajectory_server.py --read-session` 继续可用。所有 Python 内部导入从 `agent_sessions` 包进行，不依赖当前工作目录；兼容入口自行设置包路径。

## 校验与桌面打包

```bash
npm run build:ui
npm run check:size
npm run format:check
npm run desktop:build
```

本项目默认不新增或修改测试文件，也不为普通修改运行整套测试。使用构建检查、源码对照与真实应用操作验证；现有测试保留供明确需要时使用。`build:ui` 同时执行 TypeScript 检查，并预渲染启动骨架供 React 水合接管。原生加载页面及资源自动生成在 `desktop/loader`，不手改生成文件。桌面构建会先构建 UI，再将 Python 包与 `frontend/dist` 打入 sidecar，按宿主系统生成安装包（Mac app/dmg、Windows NSIS、Linux deb/AppImage）。桌面安装、来源格式边界和本机验收见 [references/desktop-app.md](references/desktop-app.md)。

代码格式由 Prettier 管理前端；`npm run check:size` 限制源码文件 400 行、CSS 300 行、测试文件 450 行，避免新功能再次堆成大文件。应按职责拆分，不机械切块；新增来源实现统一接口并在 `sources/plugins.py` 登记，目录、设置和展示层自动使用注册信息。详细约定见 [来源插件接口](references/source-plugins.md)。新增交互优先拆为组件和纯投影，异步操作的过期响应不能覆盖当前会话。历史值不能被修改或替换；自动化测试使用临时目录，不写入真实 Agent 会话。

## 源码提交

仓库仅保存源码、依赖锁文件、图标和说明。会话 JSONL、个人设置、数据库、日志、环境变量、认证及签名文件、依赖目录、缓存和安装包由 `.gitignore` 排除。实际会话数据与应用设置保存在各用户自己的数据目录。提交前检查暂存区；忽略规则不会自动移除已经被 Git 跟踪的文件。

布局由 `components/workspace-layout.tsx` 统一提供侧栏、顶栏和切换入口，两个工作区复用相同的收起、动画与宽度调整行为；页面组件仅提供导航、操作和内容。
