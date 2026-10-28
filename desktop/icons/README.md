# 应用图标

`source.png` 是用户选定的蓝色几何 A 原图，使用内置图像生成工具保留原绿色图标的三段结构，调整配色并重绘干净的轮廓。构建时用 Tauri icon 命令生成 PNG、ICNS 和 ICO，同一图标用于 macOS 关于窗口与安装包。

设计方向：保留三段错位的斜向层叠结构，以深蓝主体、浅蓝点缀和冰蓝底色形成抽象 A，使用扁平几何造型，不使用对话框。

## macOS 留白

`source-macos.png` 保留原图内容，只缩放并增加透明留白。原图底板约占画布 87%；本机 DSH 的 ICNS 不透明底板为 824 / 1024。macOS 版本使用独立的 1024 × 1024 原图，使底板宽度约占 80%，其他平台继续使用原图。这是资源尺寸的对照，实际 Dock 大小还受系统处理与悬停放大影响。

尺寸转换：`magick desktop/icons/source.png -resize 944x944 -gravity center -background none -extent 1024x1024 PNG32:desktop/icons/source-macos.png`。

构建时从对应平台原图生成 PNG、ICNS 和 ICO。正式应用由 macOS 根据应用包的 `CFBundleIconFile` 加载图标，不在启动时使用 `setApplicationIconImage` 覆盖。开发模式的图标由 Tauri 管理。

## macOS 26 系统材质

macOS 26 引入新的图标材质。苹果说明：符合圆角矩形轮廓的旧版 Mac 图标，也会自动调整轮廓并获得新材质；要精确控制分层材质和不同外观，可使用 Icon Composer。高光、玻璃边缘等效果不应直接烘焙到当前平面原图中。

参考：[Say hello to the new look of app icons](https://developer.apple.com/videos/play/wwdc2025/220/) 与 [Icon Composer](https://developer.apple.com/icon-composer/)。

## 生成提示词

Use case: precise-object-edit / logo-brand. Edit the existing Agent Sessions app icon. Change only the palette, preserving the three-piece geometric abstract A silhouette, proportions, positions, rotations, rounded corners, negative-space gaps, tile shape, and composition. Use deep royal blue (#2553D8) for the two main pieces, light sky blue (#76BCFF) for the small lower-right piece, and very pale icy blue (#ECF3FF) for the opaque rounded-square tile. Keep all pixels outside the tile transparent, with clean antialiased edges and no stray pixels or halos. No green, gradients, shadows, texture, reflections, bevels, outlines, text, watermark, mockup, or extra elements. Single centered square production app icon with safe inset.

最终轮廓重绘提示词：

Use the supplied blue app icon as a DESIGN REFERENCE, and redraw the same design from scratch as a perfectly clean vector-style production app icon. Preserve the three blue geometric pieces and their overall composition: a long rounded diagonal left stroke, a bent parallel chevron middle stroke, and a small separate lower-right parallelogram accent. Two large pieces in solid royal blue #2553D8, small piece in solid light sky blue #76BCFF, on one opaque very pale blue #ECF3FF rounded square. The rounded square must have MATHEMATICALLY SMOOTH CLEAN EDGES and sit in the center with 8% completely empty transparent padding on ALL FOUR sides. This is a pristine digital geometric icon, NOT a traced photo or an aged print. Do not copy any noise or alpha defects from the reference. Absolutely no loose pixels, flecks, white marks, rough edges, distressed texture, haze, gradients, shadows, halos, or decorative material anywhere. All pixels outside the ONE rounded square must be 100% transparent. Crisp solid geometry with antialiasing only on actual shape boundaries. Single square icon asset, no labels, no mockup, no text. Keep the recognizable blue A design and the same three-piece structure; cleanly redraw the outer tile instead of retaining the damaged outer edge.

## 菜单栏图标

`tray-source.png` 使用内置图像生成工具，以 `source.png` 为编辑目标生成透明、单色的几何 A。`tray.png` 是缩小后的 36 × 36 RGBA 资源，供 macOS 以 18 pt 显示；启用原生 template 模式，由系统根据菜单栏背景自动调整颜色。Windows 和 Linux 的托盘继续使用应用图标。

仅做尺寸转换的命令：`magick desktop/icons/tray-source.png -resize 36x36 PNG32:desktop/icons/tray.png`。

生成提示词：

Edit target: the supplied existing Agent Sessions app icon. Create its dedicated macOS menu bar template icon. Remove the entire pale rounded square background tile and all colored fill, gradients, texture, shadows, glow, and any borders. Preserve the distinctive three-piece geometric A silhouette and its proportions and recognizable negative-space gaps exactly: long rounded diagonal bar on left, bent chevron-shaped bar in the middle, small lower-right accent piece. Make ALL THREE pieces exactly solid pure black (#000000), including the accent piece. Produce a genuinely transparent RGBA background everywhere else, including between the shapes and outside them. Clean precise antialiased silhouette. This is a tiny 18-22px template status-bar glyph, so emphasize the clear silhouette, ample gaps and strong legibility. Use the entire canvas efficiently with only 10% safe padding on each side. Single centered square asset, no text, no label, no mockup, no white background, no tile, no extra elements, no variations. Preserve the original logo character; only adapt to a flat monochrome transparent menu bar glyph.
