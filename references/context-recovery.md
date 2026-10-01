# Codex 按需恢复

## 定位任务

优先级固定为：当前任务 `CODEX_THREAD_ID` → 明确任务 UUID 或原始文件路径 → 标题候选 → 可见对话关键词候选。

标题可能重复。不要猜最新一个，也不要自动选择模糊匹配结果。先列候选：

```bash
python3 scripts/session_context.py locate --title "任务标题"
```

候选包含 UUID、更新时间、历史工作目录和首条用户消息。仍无法区分时，组合标题、工作目录和记得的对话词：

```bash
python3 scripts/session_context.py locate --title "任务标题" --cwd "项目目录片段" --query "骨架屏 noReentry"
python3 scripts/session_context.py locate --query "骨架屏 noReentry" --role user --recent 100
```

内容定位只搜索用户与 Agent 可见对话，不搜索工具结果、system/developer、reasoning 或压缩载荷。它采用轻量词法匹配：默认所有关键词都要在同一任务中命中；只有没有结果时才用 `--match any`。内容匹配只负责缩小候选，最终必须使用 UUID：

无标题的内容检索默认排除当前任务和子代理派生任务，避免检索请求本身或“用于恢复旧任务的测试任务”反过来污染候选。明确需要时才加 `--include-current` 或 `--include-derived`。提供明确 `--title` 时仍会展示同名派生任务，并标注来源。

```bash
python3 scripts/session_context.py --session "任务UUID" status
```

## 标准恢复流程

从 Skill 目录执行：

```bash
python3 scripts/session_context.py status
python3 scripts/session_context.py outline
python3 scripts/session_context.py search "当前问题关键词"
python3 scripts/session_context.py turn T003
python3 scripts/session_context.py message T003/A04 --page 1
python3 scripts/session_context.py tools T003 --page 1 --page-size 15
python3 scripts/session_context.py evidence T003/C002 --query "需要核对的关键词"
python3 scripts/session_context.py agents
python3 scripts/session_context.py agent <agent-id> --query "需要核对的关键词"
```

使用其他任务时，把全局参数放在子命令之前：

```bash
python3 scripts/session_context.py --session "任务标题或任务 ID" outline
```

按下面顺序控制 Token：

1. `status`：确认任务和索引状态。
2. `outline`：分页查看每个 turn 的问题、结论短摘、工具数和媒体数。
3. `search`：只搜索用户与 Agent 可见对话。
4. `turn`：读取一个 turn 的可见对话；过长或被截断时不要提高上限，改用返回的消息引用。
5. `message`：按 `T003/A04` 或 `T003/U01` 精确读取单条消息；长消息使用 `--page` 分页。
6. `tools` / `tool`：分页查看工具轨迹和保留原值的有界输入片段，不含结果。可用 `--name`、`--status` 筛选。
7. `agents`：汇总主任务 rollout 中记录过的 `multi_agent_v1` 子代理，包括 agent ID、昵称、续跑/等待/关闭事件和是否有回传结果。
8. `agent`：按 agent ID 或唯一前缀读取主任务已经保存的子代理输入摘要和工具结果；可用 `--query` 缩小结果。
9. `evidence`：必须指定调用引用和查询词，只返回命中附近的小片段；JSON 结果按字段展开。

需要衡量读取规模时，把全局参数放在子命令前：

```bash
python3 scripts/session_context.py --stats status
```

它只给出字符数和粗略 Token 估算。`status` 出现“格式警告”时，说明当前 Codex 记录中出现了脚本尚未识别的新类型；不要声称已经完整恢复相关内容。

引用格式稳定为 `T003/U01`、`T003/A02`、`T003/C002`、`T003/C002.1`、`T003/M01`。查看器另外使用 `T003/X01` 标记压缩位置，不展示压缩载荷。`.1` 表示一个外层 `exec` 中的内部工具调用。子引用在读取结果时验证组合脚本的输出方式：明确编号或逐条 `text(await tools...)` 输出可匹配独立结果；编号重复、截断或其他无法确认归属的记录不返回组合输出，改为提示使用外层引用。未读取结果前不沿用外层的成功、失败状态。

工具很多时按需缩小范围：

```bash
python3 scripts/session_context.py tools T003 --page 2 --page-size 10
python3 scripts/session_context.py tools T003 --name exec_command
python3 scripts/session_context.py tools T003 --status error
python3 scripts/session_context.py tool T003/C002.1
```

沿引用继续读取，不要重新扫描会话。

## 子代理记录边界

`agents` / `agent` 只读取主任务 rollout 已经收到的子代理事件和结果。它可以找回已经回传到主任务的最终报告，即使后续子代理已经关闭；但 Codex 没有写入主任务的子代理内部消息、隐藏推理和未回传过程，无法通过本 Skill 凭 agent ID 重新构造。若子代理实际产生了独立 rollout，会话定位仍使用 `locate --include-derived`，再用该任务 ID 按普通流程读取。

主任务经 `exec` 组合调用多个子代理时，内部调用与外层结果共享同一份历史结果；`agent` 会明确展示这一边界，不把共享结果误称为某个内部调用的独立 transcript。

## 图片和音频

先列出媒体元数据：

```bash
python3 scripts/session_context.py media T003
```

记录可能同时包含已经失效的临时路径和仍嵌在 JSONL 中的 Base64。默认只返回类型、大小、摘要和路径是否存在，不返回二进制。确实需要查看时才提取一个引用：

```bash
python3 scripts/session_context.py media T003/M01 --extract
```

然后使用返回的本地路径查看图片或播放音频。不要批量提取媒体。

## 派生缓存

上下文索引和提取媒体都位于 Codex 目录下，权限分别为 `600` 和 `700`。索引只保存从原始会话生成的结构化记录；内容变更时会按版本或源文件校验重新生成。查看本任务占用：

```bash
python3 scripts/session_context.py cache status
```

只有用户明确要求清理时，才运行：

```bash
python3 scripts/session_context.py cache clear
python3 scripts/session_context.py cache clear --media
```

这些命令只删除本 Skill 的派生索引或媒体副本，不删除原始 JSONL。

## 输出后的工作

把取回的信息压缩成当前问题所需的短摘要，区分：

- 用户原始要求；
- 历史 Agent 判断；
- 工具证据；
- 仍需实时验证的内容。

继续当前任务时只携带这份短摘要和必要引用。
