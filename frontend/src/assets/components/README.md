# 运行组件图标

资源随应用本地打包，不在运行时请求外部图标服务。组件管理复用公共 LeadingIcon 的尺寸，保留项目图标的原始颜色。

- `fingerprint-chromium.png`：来自 [Fingerprint Chromium 148.0.7778.215](https://github.com/adryfish/fingerprint-chromium/releases/tag/148.0.7778.215) 官方 macOS 安装包内 `Chromium.app/Contents/Resources/app.icns`，转换为 128 × 128 PNG。使用该程序实际附带的 Chromium 图标。
- `mihomo.webp`：来自 [Mihomo 官方文档仓库的项目标识](https://github.com/MetaCubeX/Meta-Docs/blob/267475770faa8828f0386ddc5ed52306b340d5f0/docs/assets/logo.webp)，保留原始 80 × 80 WebP 文件。Mihomo 内核没有 macOS 应用包图标，使用官方文档的标识展示此组件。

图标权利归对应项目及其原始作者所有，这里仅用于标识对应的软件组件。Claude 图标继续使用 `assets/agents` 中的现有资源。
