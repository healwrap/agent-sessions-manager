# Agent 图标

取自 [Lobe Icons](https://github.com/lobehub/lobe-icons) 的 `@lobehub/icons-static-svg@1.95.1`，遵循同目录 `LICENSE` 中的 MIT 许可。

保留 Codex、Claude、Cursor、DeepSeek 和 Antigravity 的 SVG 图形与颜色。Codex 和 Cursor 通过 CSS 遮罩跟随界面文字颜色，适配浅色与深色外观；Antigravity 桌面端与 CLI 共用品牌图标。

资源随应用本地打包，运行时不访问图标服务。来源标识与图标的展示映射位于 `components/agent-icon.tsx`。

账号、环境、组件管理和检测等内容区域使用品牌原色。侧边导航和下拉菜单显式传入 `monochrome`，让图标跟随菜单的中性色；不要在内容区域把 Claude 等彩色品牌图标转换为灰色。
