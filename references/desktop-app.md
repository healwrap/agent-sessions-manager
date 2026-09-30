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
| Antigravity 桌面 / CLI | 会话摘要、可见正文、调用参数、执行记录、错误 | 两个实例保留独立键；按步骤最新快照读取，执行输出没有可靠关联标识时单独展示。只有摘要的会话保留在列表，说明未保存 transcript。未解析二进制步骤载荷，不宣称完整工具结果支持。 |

后台只监听本机回环地址，界面资源随包附送，没有 CDN 或上传历史行为。SQLite 正常使用只读连接；不能打开活动库时，核对源文件状态后复制数据库和 WAL 到临时目录读取，避免遗漏已提交记录。保留原字段值，不自动替换 URL、输入或输出。

来源统一键为 `provider:instance:native-key`。引用随原生 UUID、步骤或原有 Codex 引用保持稳定；事件正文每页 7000 字符、轨迹每页默认 150 条，滚到边缘自动补页。工具结果只在用户打开结果时读取。

本版的侧栏搜索覆盖标题和项目，轨迹搜索覆盖当前会话可见正文、引用和参数摘要。跨会话正文搜索、自动交接摘要和后台目录监听暂未加入。

## 构建

需要 macOS、Xcode Command Line Tools、Rust/Cargo、Node/npm 和 Python 3。从仓库根目录运行：

```bash
npm ci
python3 scripts/build_desktop.py
```

脚本创建专用构建环境，将 Python 与查看器资源打包为 sidecar，再构建 Tauri 应用和普通安装镜像。运行成品无需上述开发依赖。

输出：

- `desktop/target/release/bundle/macos/Agent Sessions.app`
- `desktop/target/release/bundle/dmg/Agent Sessions_0.1.0_aarch64.dmg`（本机 Apple Silicon 构建）

包面向本机测试，尚未使用 Developer ID 签名与 Apple 公证。外部分发需另行配置发布身份；不要把本机启动成功当作分发验收。

Rust 外壳：`desktop/src/main.rs`。后台与来源：`scripts/trajectory_server.py`、`codex_source.py`、`agent_sources.py`。应用整理设置：`scripts/view_settings.py`。构建锁文件随仓库保存。

## 验证

```bash
python3 scripts/agent_sources_self_test.py
python3 scripts/trajectory_self_test.py
python3 scripts/self_test.py
python3 scripts/nested_results_self_test.py
node scripts/trajectory_chat_self_test.cjs
node scripts/trajectory_focus_self_test.cjs
```

来源测试涵盖同名原生 ID 隔离、Claude 分支和乱序结果关联、半行写入、记录重写、可见正文全文匹配、Antigravity 步骤更新与摘要空态、WAL 快照、原值保留与项目设置持久化。桌面验收另外检查真实窗口、关闭常驻、重复打开、后台停止恢复和退出清理。

官方实现依据：[Tauri sidecar](https://v2.tauri.app/develop/sidecar/)、[托盘](https://v2.tauri.app/learn/system-tray/)、[单实例](https://v2.tauri.app/plugin/single-instance/)。
