# 运行组件图标

资源随应用本地打包，不在运行时请求外部图标服务。组件管理复用公共 LeadingIcon 的尺寸，保留项目图标的原始颜色。

- `fingerprint-chromium.png`：来自 [Fingerprint Chromium 148.0.7778.215](https://github.com/adryfish/fingerprint-chromium/releases/tag/148.0.7778.215) 官方 macOS 安装包内 `Chromium.app/Contents/Resources/app.icns`，转换为 128 × 128 PNG。使用该程序实际附带的 Chromium 图标。
- `clash-verge.png`：来自 [Clash Verge Rev 官方仓库](https://github.com/clash-verge-rev/clash-verge-rev/blob/dev/src-tauri/icons/icon.png) 的原始 512 × 512 PNG，使用透明背景的圆形标志，避免 macOS 应用图标自带的底座和留白。

图标权利归对应项目及其原始作者所有，这里仅用于标识对应的软件组件。Claude 图标继续使用 `assets/agents` 中的现有资源。
