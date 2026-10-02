# Agent Sessions Manager

用于管理本机 Codex、Claude Code、Cursor、Antigravity、Antigravity CLI、DeepSeek Harness 会话的桌面应用与 Skill。Claude Code 桌面端与 CLI 共用会话正文，在界面中合并展示。Cursor 读取桌面端本地 Agent / Composer 会话数据库。提供项目会话列表、对话、工具轨迹和按需恢复入口。历史文件保持只读，应用整理设置独立保存。

## 项目结构

源码目录为 `agent-sessions-manager/`，Skill 安装入口仍为 `agent-sessions`，应用名仍为 Agent Sessions。

```text
SKILL.md                         Skill 入口与读取边界
agents/openai.yaml               Skill 显示信息
references/                      按需加载的恢复、查看器与桌面说明
frontend/
  src/app.tsx                    React 应用组合
  src/components/                项目侧栏、聊天、时间线、详情、设置
  src/state/                     会话状态、目录、分页读取与导航请求控制
  src/hooks/                     状态订阅、自动同步与滚动分页
  src/lib/                       API、类型、纯数据投影
  src/styles/                    Tailwind 入口、主题变量与侧栏、聊天、轨迹、设置分区样式
  public/                        图标与第三方许可证
backend/agent_sessions/
  api/                           本机 HTTP API 与静态资源服务
  sources/                       Codex / Claude / Cursor / Antigravity / DSH 与目录聚合
  context/                       定位、索引、原话、证据、CLI 与续接
  trajectory/                    执行时长投影、折叠摘要与圈选定位
  settings.py                    独立应用设置
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

## 开发

需要 Node 22.12+（或兼容 Vite 的更新版本）与 Python 3.10+。从根目录运行：

```bash
npm ci
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python3 scripts/trajectory_server.py --port 8765
```

Windows 使用 `.venv\Scripts\Activate.ps1` 激活环境。另一个终端运行 `npm run dev`。Vite 的界面和 API 代理仅绑定回环地址；桌面和正式本地服务使用构建后的静态资源：

```bash
npm run build:ui
python3 scripts/trajectory_server.py --port 8765
```

如果只使用上下文恢复 CLI，无需安装 Node 或构建前端；Codex 专用恢复不依赖 `zstandard`。既有 `scripts/session_context.py` 命令与 `scripts/trajectory_server.py --read-session` 继续可用。所有 Python 内部导入从 `agent_sessions` 包进行，不依赖当前工作目录；兼容入口自行设置包路径。

## 校验与桌面打包

```bash
npm run test
npm run format:check
npm run desktop:build
```

`test` 运行 Python 和 Vitest 回归；`build:ui` 同时执行 TypeScript 检查，并预渲染启动骨架供 React 水合接管。原生加载页面及资源自动生成在 `desktop/loader`，不手改生成文件。HTTP 资源测试需要先构建 UI。桌面构建会先构建 UI，再将 Python 包与 `frontend/dist` 打入 sidecar，按宿主系统生成安装包（Mac app/dmg、Windows NSIS、Linux deb/AppImage）。桌面安装、来源格式边界和本机验收见 [references/desktop-app.md](references/desktop-app.md)。

代码格式由 Prettier 管理前端；`npm run check:size` 限制源码文件 400 行、CSS 300 行、测试文件 450 行，避免新功能再次堆成大文件。应按职责拆分，不机械切块；新增来源放入 `backend/agent_sessions/sources/` 并在聚合器登记。新增交互优先拆为组件和纯投影，异步操作的过期响应不能覆盖当前会话。历史值不能被修改或替换；自动化测试使用临时目录，不写入真实 Agent 会话。

## 源码提交

仓库仅保存源码、依赖锁文件、图标和说明。会话 JSONL、个人设置、数据库、日志、环境变量、认证及签名文件、依赖目录、缓存和安装包由 `.gitignore` 排除。实际会话数据与应用设置保存在各用户自己的数据目录。提交前检查暂存区；忽略规则不会自动移除已经被 Git 跟踪的文件。
