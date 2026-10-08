# 应用图标

`source.png` 是用户选定的绿色几何 A 原图，使用内置图像生成工具生成。构建时用 Tauri icon 命令生成 PNG、ICNS 和 ICO，同一图标用于 macOS 关于窗口与安装包。

设计方向：错位的斜向层叠，以深绿主体、青柠点缀和浅鼠尾草底色形成抽象 A，使用扁平几何造型，不使用对话框。

## macOS 留白

`source-macos.png` 保留原图内容，只缩放并增加透明留白。原图底板约占画布 90%，在 ⌘Tab 和 Dock 中明显大于其他图标；本机 DSH 的不透明底板为 824 / 1024。macOS 版本使用独立的 1024 × 1024 原图，使底板宽度约占 80%，其他平台继续使用原图。

尺寸转换：`magick desktop/icons/source.png -resize 914x914 -gravity center -background none -extent 1024x1024 PNG32:desktop/icons/source-macos.png`。

构建时从对应平台原图生成 PNG、ICNS 和 ICO。macOS 运行时直接加载 ICNS 的多分辨率图像，与安装包图标一致，避免单张 PNG 覆盖原生图标。

## 生成提示词

Use case: logo-brand. Create one elegant distinctive production desktop application icon for Agent Sessions Manager. Concept: staggered layers / organized histories. A bold compact emblem of three offset parallel oblique slabs, carefully composed to create a subtle abstract A through negative space. This is an expertly designed geometric logo, not paper cards or a bar chart: no borders, no internal lines, no tiny details. Use a precise Bauhaus-influenced architectural silhouette with deliberate rhythm, strict spacing, softly rounded endpoints and beautiful optical balance. Flat dark evergreen main shapes with one small lime accent plane on a solid very pale sage rounded-square tile, transparent outside corners. Original premium productivity software identity with design sophistication, strong recognition at 32 pixels. Centered 1024 square, ample safe inset. No gradients, no light reflections, no texture, no shadows, no 3D, no glass, no speech bubbles, no dialog cards, no dots and connecting lines, no text, no mockup, no watermark. Flawless clean antialiased edges.

## 菜单栏图标

`tray-source.png` 使用内置图像生成工具，以 `source.png` 为编辑目标生成透明、单色的几何 A。`tray.png` 是缩小后的 36 × 36 RGBA 资源，供 macOS 以 18 pt 显示；启用原生 template 模式，由系统根据菜单栏背景自动调整颜色。Windows 和 Linux 的托盘继续使用应用图标。

仅做尺寸转换的命令：`magick desktop/icons/tray-source.png -resize 36x36 PNG32:desktop/icons/tray.png`。

生成提示词：

Edit target: the supplied existing Agent Sessions app icon. Create its dedicated macOS menu bar template icon. Remove the entire pale rounded square background tile and all colored fill, gradients, texture, shadows, glow, and any borders. Preserve the distinctive three-piece geometric A silhouette and its proportions and recognizable negative-space gaps exactly: long rounded diagonal bar on left, bent chevron-shaped bar in the middle, small lower-right accent piece. Make ALL THREE pieces exactly solid pure black (#000000), including the formerly lime piece. Produce a genuinely transparent RGBA background everywhere else, including between the shapes and outside them. Clean precise antialiased silhouette. This is a tiny 18-22px template status-bar glyph, so emphasize the clear silhouette, ample gaps and strong legibility. Use the entire canvas efficiently with only 10% safe padding on each side. Single centered square asset, no text, no label, no mockup, no white background, no tile, no extra elements, no variations. Preserve the original logo character; only adapt to a flat monochrome transparent menu bar glyph.
