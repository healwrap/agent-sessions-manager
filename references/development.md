# 开发与项目结构

[返回项目首页](../README.md)

## 项目结构

源码目录为 `agent-sessions-manager/`，Skill 安装入口仍为 `agent-sessions`，应用名仍为 Agent Sessions。

```text
SKILL.md                         Skill 入口与读取边界
agents/openai.yaml               Skill 显示信息
references/                      按需加载的恢复、查看器与桌面说明
frontend/
  src/workspace.tsx              启动页与工作区切换
  src/app.tsx                    React 应用组合
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
  desktop_client/                官方 Claude App 环境启动、隔离与连接观测
  network/                       Clash Verge 接入、账号线路与直连配置
  components/                    运行组件安装、更新与卸载
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

## 持续同步

应用自动跟进已写入本地历史的消息、工具结果与轮次状态。正在工作的会话每 750 毫秒检查来源的轻量版本标记，只有记录变化才更新正文和轨迹；闲置检查沿用设置中的同步间隔。桌面窗口在后台仍可同步，关闭到状态栏或暂停同步时停止检查。

对话处于底部时跟随新增内容；向上阅读时保持位置，已手动展开的正文页数会保留。长输出继续按页读取。实时同步的范围取决于原 Agent 保存的数据：没有写入会话文件的逐字生成内容或进程输出，不会被历史读取器凭空补齐。

## 开发

需要 Node 22.12+（或兼容 Vite 的更新版本）与 Python 3.12.x；开发入口会在加载后台前校验版本。从根目录运行：

```bash
npm ci
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python3 scripts/trajectory_server.py --port 8766
```

Windows 使用 `py -3.12 -m venv .venv` 创建环境，通过 `.venv\Scripts\Activate.ps1` 激活。已有虚拟环境保留创建时的 Python 版本，需要升级时用 Python 3.12 重新创建。另一个终端运行 `npm run dev`。Vite 的界面和 API 代理仅绑定回环地址；桌面和正式本地服务使用构建后的静态资源：

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

本项目默认不新增或修改测试文件，也不为普通修改运行整套测试。使用构建检查、源码对照与真实应用操作验证；现有测试保留供明确需要时使用。`build:ui` 同时执行 TypeScript 检查，并预渲染启动骨架供 React 水合接管。原生加载页面及资源自动生成在 `desktop/loader`，不手改生成文件。桌面构建会先构建 UI，再将 Python 包与 `frontend/dist` 打入 sidecar，按宿主系统生成安装包（Mac app/dmg、Windows NSIS、Linux deb/AppImage）。桌面安装、来源格式边界和本机验收见 [references/desktop-app.md](desktop-app.md)。

代码格式由 Prettier 管理前端；`npm run check:size` 限制源码文件 400 行、CSS 300 行、测试文件 450 行，避免新功能再次堆成大文件。应按职责拆分，不机械切块；新增来源实现统一接口并在 `sources/plugins.py` 登记，目录、设置和展示层自动使用注册信息。详细约定见 [来源插件接口](source-plugins.md)。新增交互优先拆为组件和纯投影，异步操作的过期响应不能覆盖当前会话。历史值不能被修改或替换；自动化测试使用临时目录，不写入真实 Agent 会话。

## 源码提交

仓库保存源码、依赖锁文件、图标、说明和用于推广的演示媒体。会话 JSONL、个人设置、数据库、日志、环境变量、认证及签名文件、依赖目录、缓存和安装包由 `.gitignore` 排除。实际会话数据与应用设置保存在各用户自己的数据目录。提交前检查暂存区；忽略规则不会自动移除已经被 Git 跟踪的文件。
