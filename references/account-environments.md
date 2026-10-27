# 账号与独立环境

## 需求与实现

| 用户要求 | 当前实现与验收方式 |
| --- | --- |
| Claude 网页与官方 App 分别管理 | 一个本地账号分别绑定浏览器 Profile 和 App Profile，登录数据各自保存；不假定两者共享登录态。 |
| 多账号切换 | 账号创建、重命名、绑定、删除配置；账号入口打开其绑定环境，已有账号网页优先聚焦，不重复启动同一 Profile。 |
| 独立浏览器状态 | 每个 Profile 使用应用目录内独立 `--user-data-dir`；Cookie、Local Storage、历史和缓存分别保存。删除配置保留浏览数据。 |
| Chrome 启动与管理 | 支持本机 Google Chrome 和 Fingerprint Chromium；启动、聚焦、重试、停止，显示实际 PID、数据目录、当前标签页和运行状态。 |
| 独立指纹 | Fingerprint Chromium 使用固定种子；Google Chrome 使用其原生设备指纹，不把原生 Chrome 的 Profile 称为指纹伪装。Canvas 可跨次比较。 |
| 独立语言与时区 | 可手动设置或从出口定位；没有跟随系统选项。普通 Chrome 在新标签页执行前应用区域设置，指纹内核使用原生参数。 |
| 只给指定环境代理 | 每个环境绑定 HTTP、HTTPS 或 SOCKS5 代理，可带认证；经本机转发器交给该环境，不改系统代理或 TUN，不在代理失败后切回直连。 |
| 启动前检查 | 保留代理、地区、指定出口的门控。每项可强制、提醒或关闭；强制失败或未验证保持拦截，不为通过验收而关闭。 |
| 在目标浏览器检测 | 管理页直接在对应 Profile 打开本地采样页并接收结果；外部 SunBrowser / Chrome 保留一次性链接。 |
| IP 信誉与住宅属性 | 查询实测出口的 Net.Coffee 原始评分、住宅/机房分类及风险标记，保留来源，不生成 Claude 官方账号评分。 |
| DNS 观测 | 目标浏览器访问 BrowserLeaks 的随机 IPv4/IPv6 域名，取得权威端观察到的解析器 IP、地区和运营商；配置预期 DNS 后才能判断列表是否一致。 |
| WebRTC 观测 | 目标浏览器收集真实 ICE 候选，公网地址与 HTTP 出口比较；启用了禁止非代理 UDP 时可能没有公网候选，显示未验证。 |
| 登录状态与重开 | 检查实际 Cookie 数据库中未过期登录 Cookie 的存在；本地检测页的 Cookie/Local Storage 标记用于验证 Profile 隔离及重开持久化。真实 Claude 登录保持仍需登录后验收。 |
| 关闭与恢复 | 正常浏览器停止先请求浏览器保存并退出，再处理未响应进程。运行记录持久化；管理器重启后显示上次状态，遗留进程按可执行文件与独立目录核对后恢复，不能接管用户默认浏览器。 |
| Claude App 隔离 | 独立用户数据目录及 `CLAUDE_CONFIG_DIR`，使用白名单启动环境；不继承 CC Switch/CLI 的供应商、API Key 或思考强度变量，不改官方 App 包。 |
| 共用项目与组件 | 使用同一仓库和分支；工作区、按钮、设置行、结果卡片、状态标签、窗口分栏复用现有组件。 |

## 使用流程

1. 在「账号管理」创建账号，选择自动创建独立环境或绑定未被使用的环境。
2. 保存专用代理；在环境设置中指定语言、时区及需要固定的出口 IP。
3. 打开浏览器。先进行后台预检，再在这个浏览器的本地页实际采样；强制项全部通过才进入账号网站。
4. 在官方页面完成真人验证与登录。管理器显示本地登录状态是否存在，不能以本地 Cookie 存在代替服务端账号有效性。
5. 关闭后从同一账号入口重开；切换账号时使用另一个独立 Profile。官方 App 切换会先退出旧 App 环境。

浏览器检测页会创建一个仅属于本机检测域名的存储标记。不同 Profile 的标记应不同，同一个 Profile 关闭重开后应相同；它不写入 Claude 域名，不修改 Claude 登录 Cookie。

## 验收记录（2026-10-27）

- 已实测指纹 Chromium 与普通 Chrome 在不同数据目录中运行，分别返回 `en-US / America/Los_Angeles` 与 `ja-JP / Asia/Tokyo`。
- 两者使用独立绑定的代理，代理、地区、固定 IPv6 出口、语言与时区的强制门控均通过。
- 已取得目标浏览器的实际 Claude / Cloudflare 出口、Canvas / WebGL、Cookie / Local Storage 标记和 DNS 解析器。
- 已关闭两个浏览器并重启管理器，再打开后两个存储标记分别保持不变，PID 已更换；Canvas 基线保持一致。
- 已验证检测启动后从账号入口进入官方页面；重复打开保持同一进程与一个账号标签页。
- 已模拟验收后台意外退出，重启后识别到两个浏览器及 App 的遗留进程；点击恢复后，三个进程均重新运行，两个浏览器的存储标记保持不变。
- 已在实际界面完成账号创建、自动创建两个环境、重命名和代理绑定；删除账号配置后，绑定环境仍然保留。运行中的环境拒绝修改或删除。
- 已使用不可用的专用代理验证启动拦截：没有创建浏览器进程，也没有回退直连。
- 已进入官方 Claude App 的邮箱登录表单，App 的代理转发器观测到 `claude.ai` 与官方认证资源域名。
- 已实测官方 App 账号 A → B → A：先正常退出原进程再启动目标环境，三个启动均成功；A 重用原目录，B 使用另一目录，语言配置各自保留。
- 已检查官方 App 进程的独立 `CLAUDE_CONFIG_DIR`，且未继承 API Key、供应商地址或思考强度环境变量。
- 真实 Claude 登录需要用户在独立窗口完成 Cloudflare 真人验证与官方登录，之后再验收关闭重开后的账号保持。
- 当前官方 Claude App 拒绝调试参数，因此不添加调试参数、不修改 App 包；语言设置文件和进程时区分别配置，App 运行时指纹与公网出口不冒充浏览器检测结果。

## 数据来源与协议

- [Chromium 独立数据目录](https://www.chromium.org/developers/creating-and-using-profiles/)
- [Chrome 自定义目录的调试连接](https://developer.chrome.com/blog/remote-debugging-port)
- [Chrome DevTools Target 协议](https://chromedevtools.github.io/devtools-protocol/tot/Target/)
- [macOS 应用正常退出接口](https://developer.apple.com/documentation/appkit/nsrunningapplication/terminate())
- [BrowserLeaks DNS 测试说明](https://browserleaks.com/dns)

浏览器管理连接只监听回环地址，仅连接本应用创建的独立目录。DNS 使用第三方观测服务，服务失败、无回包或未配置预期解析器时保留未验证结果。
