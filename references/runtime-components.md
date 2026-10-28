# 平台与组件管理

「设置 → 组件管理」管理 Fingerprint Chromium、Mihomo 和 Claude App 三个组件，集中显示版本、来源、安装位置，以及安装、检查更新、重新安装和卸载操作。浏览器只管理 Fingerprint Chromium，不提供 Google Chrome 的安装和更新入口。运行中的环境会阻止相关组件更新或卸载。账号与独立环境数据保存在组件目录之外，卸载受管组件时保留；重新安装后可以继续使用原来的环境。

安装包包含 Agent Sessions 自己的界面与后台。浏览器、Mihomo 和 Claude 首次使用时从对应发布方下载，不预先附带在桌面安装包中。下载成功的官方包会缓存以便重新安装；卸载组件时清除对应二进制和下载缓存。

| 组件 | macOS | Windows | 管理方式 |
| --- | --- | --- | --- |
| Fingerprint Chromium | 上游当前提供 Apple Silicon DMG | 上游 x64 ZIP | GitHub 发布 SHA256 校验，独立安装、更新、卸载 |
| Mihomo | arm64 / amd64-compatible | arm64 / amd64-compatible | 官方发布 SHA256 校验，独立安装、更新、卸载 |
| Claude App | Anthropic 官方通用 ZIP，校验 Apple 发布者签名 | Anthropic 官方 MSIX，校验 Authenticode 后请求 Windows 授权安装 | 管理官方程序，账号数据继续使用各自的独立目录 |

Windows ARM 上的指纹浏览器使用 x64 兼容版本，需要操作系统支持 x64 应用。上游没有适用指纹浏览器发行包时，界面显示不可安装。已有 Chrome 环境保留兼容能力，本机 Chrome 不参与组件管理。

## 官方应用与本机安装

本机原有 Claude 标记为「本机安装」，也提供卸载入口；卸载确认弹窗显示具体安装位置，后台只接受与确认位置一致的当前安装。macOS 通过系统文件管理接口将本机 Claude.app 移入废纸篓，保留登录和配置目录，不操作 Keychain。Windows 通过系统包管理卸载 MSIX；旧版 Squirrel 安装则校验发布者签名后调用自带的 Update.exe 卸载程序。

macOS 的「安装受管版本」将副本放入应用自己的组件目录，环境优先使用受管副本。卸载该副本后若仍存在本机 Claude，界面会显示检测到的本机版本，并提示所选副本已卸载。Windows Claude 使用系统注册的官方 MSIX；「接管并更新」明确记录所管理的包，后续按包身份检查更新与卸载，不直接删除 WindowsApps。

Claude Windows MSIX 的 Cowork 服务需要管理员授权。安装会显示 Windows 授权请求，拒绝授权时保留原状态并报告未完成；卸载调用当前用户的系统卸载入口。Windows 卸载器可能清除官方包自身的本地数据，确认弹窗会说明，本应用保存的独立账号与环境数据仍会保留。官方说明见 [Windows 部署](https://support.claude.com/en/articles/12622703-deploy-claude-desktop-for-windows)。本应用不修改 Claude 官方程序或其更新签名，官方自身更新后会重新读取实际版本；Windows 使用包族身份保留管理关系。

指纹 Chromium 来自 [上游发布](https://github.com/adryfish/fingerprint-chromium/releases)，Mihomo 来自 [官方发布](https://github.com/MetaCubeX/mihomo/releases)，Claude 使用 [官方下载](https://claude.com/download)对应的版本清单或 MSIX 入口。

## 平台实现与验收

- 原生进程识别使用真实可执行文件和参数核对，Windows 不再依赖 `ps`；窗口激活、关闭与进程回收分别使用平台原生能力。
- Windows 识别常见 Chrome / Claude 路径和 Claude MSIX 注册位置，保留启动所需用户目录变量，随后台附带 IANA 时区数据。
- Windows 本机 skills 继承使用目录联接，不要求开启开发者模式来创建符号链接。
- 系统代理与 DNS 读取使用 Windows 系统接口或 macOS `scutil`，保持只读。
- GitHub 的 `Desktop builds` 工作流提供 macOS 和 Windows 的原生进程检查、界面构建、桌面打包与安装包制品。可通过 `workflow_dispatch` 执行；仅添加工作流不会产生已通过的构建记录。

macOS 在当前机器验证；Windows 代码适配、包格式分支与打包工作流已提供，Windows 实机安装、UAC、登录回调和重启恢复仍需在 Windows 上验收。
