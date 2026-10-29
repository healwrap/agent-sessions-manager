# Claude 账号用量

账号详情展示 5 小时、7 天及服务实际返回的模型额度、重置时间与额外用量。缺失的窗口不推算为零；团队按金额计费时可只显示额外用量。

账号可在用量区域单独授权后台查询。首次授权通过该账号已绑定、通过启动检查的独立浏览器打开 Claude OAuth 页面，使用 PKCE / state 并仅请求 `user:profile`，用户将结果授权码粘贴回应用。后端通过同一账号的专用代理交换授权、查询 profile 并核对邮箱后，才保存到应用自己的 `usage-oauth` 目录；目录权限为 0700，账号文件为 0600，原子写入。授权不写入浏览器、Claude App 或 Claude Code 的登录目录。

已有后台授权时，查询优先直接访问 OAuth profile / usage，浏览器和 App 均可关闭。使用账号浏览器环境绑定的专用代理与预检；没有浏览器环境时沿用已绑定的 App 环境代理。授权到期前自动续期，轮换结果立即保存，按账号的跨进程文件锁串行处理；登录授权无效后停止续期重试并显示重新授权。新授权产生独立版本，使旧查询缓存与正在执行的旧任务失效。授权任务超时、取消、账号或代理绑定变化、邮箱不匹配时，均不写入新授权。

尚未单独授权时，仍可在账号绑定且已通过启动检查的浏览器中使用现有页面登录态读取 `/api/account`、`/api/organizations` 和组织的 `/usage`；也可读取此账号 App 环境内的有效 Claude Code OAuth 作为后备。后者只读，过期由原客户端更新，不由用量模块续期。macOS 只读取该配置目录对应的钥匙串服务，其他平台读取该目录的凭据文件，不读取全局 Claude / CC Switch 配置。没有可用登录时，引导授权后台查询。

缓存只保存归一化用量和时间等结果，不保存 Cookie 或 token。重新绑定环境、修改账号或代理后使旧缓存失效；并发刷新合并，同账号成功后至少间隔 3 分钟，常规缓存 5 分钟。错误保留上次成功结果并标记时间；限流遵守 Retry-After，网络失败退避。仅在查看面板时触发刷新，不增加常驻配额轮询。

接口与凭据分工参考 [claude-swap](https://github.com/realiti4/claude-swap/tree/72ccd58612efc8651933b7137deafba28901ef04) 的 OAuth 用量、锁与缓存设计（MIT）；本实现不引入其全局账号切换和设置共享。网页接口资料另见 [CodexBar 的 Claude 来源说明](https://github.com/steipete/CodexBar/blob/main/docs/claude.md)。

## 账号总览与 Token 估算

账号管理顶部汇总全部账号、Claude 额度可用账号、用尽、明确停用和待确认数量。可用要求近期查询成功，5 小时、周额度及当前模型实际返回的额度均未用尽；登录失效、HTTP 403 和网络故障不等于账号停用。缺失窗口、重置后未更新的窗口与过期结果不计为可用。刷新全部复用原缓存、冷却和退避，同一后端最多同时查询两个账号。账号列表、总览和详情共用一次本地轮询，隐藏页面停止查询。

Token 数据来自 [All Done Sites Claude Usage Tracker](https://alldonesites.com/claude-usage-tracker/) 的[公开 JSON](https://alldonesites.com/data/claude-usage.json)，测量和换算实现见 [jonathanavis96/claude-usage-tracker](https://github.com/jonathanavis96/claude-usage-tracker)（MIT）。展示 schema v2 的 `credits.window_tokens.per_family` 混合量，结合套餐比例、各套餐周窗口和模型包含范围换算；不使用来源已标记弃用的 `rates` 数字。模型列表随数据源更新，目前有 Opus 5.5、Opus 5、Sonnet 5、Haiku 4.5 和 Fable 5.1；Sonnet 5.5、Haiku 5.5、Opus 4.6 在尚无独立混合量时，按 `credits.measured_rates.per_family` 已发布的消耗比例及 Opus 5 样本换算，保留价格近似说明并标注“比例估算”。仅在输入、输出共用同一比例时换算。来源补齐独立混合量后自动优先采用。内置 2026-10-29 发布数据快照，每 6 小时在查看总览时同步，失败保留原快照和原发布时间。公共数据自动使用系统网络与代理设置，估算依据弹窗可手动同步，不提供单独的代理配置。

每个账号按服务返回的 `analytics_subscription_plan` 和 `rate_limit_tier` 识别 Pro / Max 5x / Max 20x，并在账号列表与详情标记。仅有粗粒度 Max 标签时仍需确认倍数；通用的 `default_claude_ai` 不代表 Pro。无法识别时显示套餐待确认，可在账号编辑中手动指定估算套餐，设置不会变更真实订阅或使已有用量缓存失效。总额按套餐分别换算；余额乘以该账号实际剩余比例。同一邮箱与组织只汇总一次，标明已覆盖账号数。缺少套餐或模型数据时显示缺失原因，不换成其他单位。

页面统一显示混合 Token，汇总输入、输出、缓存创建和缓存读取，随第三方样本工作负载变化。模型比例中的参考值、实测值、按模型价格近似和 Pro / Max 5x 的比例推算分别保留来源说明；日期、样本账号数、估算区间和原始数据链接可在“估算依据”中查看。总览的 5 小时和周余额分别按各自窗口计算，不能相加，也不代表立刻能消耗完全部周额度。

套餐的 5 小时容量倍数采用 [Claude 官方 Max 说明](https://support.claude.com/en/articles/11049741-what-is-the-max-plan)，核对日期为 2026-10-29：Pro 为基准，Max 5x 为 5 倍，Max 20x 为 20 倍。旧社区表的 Max 5x / Pro 为 6 倍，不再采用。应用读取旧缓存时也会立即应用官方倍数。这个官方比例不延伸为官方周容量；Token 基础容量与周窗口仍标为社区测量或推算。

另核对了 [ccusage Blocks](https://ccusage.com/guide/blocks-reports) 和 [Claude Code Usage Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor)。前者支持用历史最大窗口或用户指定限额，后者 v4 区分官方读数、本地估算和未知状态，均未给出可直接替代的、按当前每种模型独立实测的固定混合 Token 配额。未将旧版预设 Token 数或 API 定价当作订阅固定额度。

账号访问状态单独记录：身份接口成功且邮箱核对通过后记录“可访问”和时间；明确的 `account_disabled` / `account_suspended` / `account_banned` 归为账号停用，`organization_disabled` 单独归为组织停用。401 记录登录待确认，其他 403 和连接异常不推定封禁。超过 5 分钟的可访问结果只显示“上次可访问”，总览计入待确认。检测账号与刷新用量共用受控环境及冷却间隔。
