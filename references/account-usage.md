# Claude 账号用量

账号详情展示 5 小时、7 天及服务实际返回的模型额度、重置时间与额外用量。缺失的窗口不推算为零；团队按金额计费时可只显示额外用量。

优先在账号绑定且已通过启动检查的独立浏览器中，使用现有页面登录态读取 `/api/account`、`/api/organizations` 和组织的 `/usage`。查询前核对邮箱；多个组织时沿用浏览器当前组织，也可明确选择组织。不复制登录 Cookie，不打开未受管浏览器。

浏览器未运行时，可读取此账号 App 环境内的 Claude Code OAuth 凭据，按绑定代理访问 OAuth profile / usage。macOS 仅查找该配置目录对应的钥匙串服务，其他平台读取该目录的凭据文件。用量模块只读取凭据，过期时交由环境内客户端更新，不刷新 token，不读取全局 Claude / CC Switch 配置。没有可用凭据时，从面板打开账号浏览器后查询。

缓存只保存归一化用量和时间等结果，不保存 Cookie 或 token。重新绑定环境、修改账号或代理后使旧缓存失效；并发刷新合并，同账号成功后至少间隔 3 分钟，常规缓存 5 分钟。错误保留上次成功结果并标记时间；限流遵守 Retry-After，网络失败退避。仅在查看面板时触发刷新，不增加常驻配额轮询。

接口与凭据分工参考 [claude-swap](https://github.com/realiti4/claude-swap/tree/72ccd58612efc8651933b7137deafba28901ef04) 的 OAuth 用量、锁与缓存设计（MIT）；本实现不引入其全局账号切换和设置共享。网页接口资料另见 [CodexBar 的 Claude 来源说明](https://github.com/steipete/CodexBar/blob/main/docs/claude.md)。
