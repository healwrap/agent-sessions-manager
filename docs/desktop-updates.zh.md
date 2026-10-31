# 应用内更新

桌面版从 0.2.0 接入应用内更新。旧版本没有更新入口，首次需要安装一次新版本；之后在“设置 → 应用更新”完成检查、下载、校验与安装重启。界面和内置 Python 后台随同一个更新包发布，保持版本一致。账号、登录数据、会话和应用设置留在原用户数据目录。

启动时只检查，不自动安装。下载可在账号运行时进行；安装前后台会在运行锁内确认所有账号环境已停止，并阻止新的账号启动。安装失败会尝试恢复后台。更新仅接受固定 GitHub 发布渠道，要求有效签名及与发布版本一致的签名版本，不接受前端传入下载地址。

## 本机构建

`python tools/build_desktop.py` 仍生成普通安装包。有签名密钥时还会在 `dist/updates/` 生成签名更新包和平台发布记录。macOS 会在最终应用签名之后打包，更新包包含正式构建的应用与内置后台。

密钥可通过 `TAURI_SIGNING_PRIVATE_KEY` 或 `TAURI_SIGNING_PRIVATE_KEY_PATH` 提供；密码使用 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。本机也会查找用户配置目录下的 `agent-sessions/updater/desktop.key`。私钥只保留在私有目录或 CI Secret，仓库仅保存 `desktop/updater.pub`。不要把私钥提交到仓库。发布签名使用 `--app-version`，构建会再次验证签名、公钥及版本匹配。

未配置密钥时允许生成本地安装包，但不生成可发布的更新。设置 `AGENT_SESSIONS_REQUIRE_UPDATE_SIGNATURE=1` 会使缺少签名的构建失败。

## GitHub 发布

发布工作流是 `.github/workflows/desktop-release.yml`。启用前需在仓库 Actions Secrets 配置与已提交公钥对应的 `TAURI_SIGNING_PRIVATE_KEY`，有密码时再配置 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。

同步修改 `package.json`、`package-lock.json`、`desktop/Cargo.toml` 和 `desktop/tauri.conf.json` 的版本，并更新 Cargo 锁文件。推送相同版本的 `v<版本号>` 标签后，工作流构建 macOS Apple Silicon 与 Windows x64，生成更新签名，合并 `latest.json` 并发布 GitHub Release。也可手动从主分支触发，填写同样的发布标签；首次发布可先完成构建再创建标签。两端构建全部成功后才发布更新清单，同时附带首次安装镜像。其他架构暂不发布更新包。

固定清单地址：`https://github.com/healwrap/agent-sessions-manager/releases/latest/download/latest.json`。未发布清单时，应用显示“暂未发布更新”；网络错误不会显示成“已是最新版本”。发布渠道未配置 Secret 或尚未发布 Release 时，应用内更新不能被当作已上线。

## 偏好与历史迁移

首次迁入 Claude 登录后，程序可从同一账号的原环境找到唯一组织并同步本地会话，不再等待新环境先创建一条会话。有多个组织且无法确认时保留待确认状态，不猜测组织。

常规设置按白名单继承一次，并备份被修改文件。当前包括主题、界面语言、终端布局、提交署名显示、侧边栏、收藏与分栏等视图偏好。已有账号的设备、代理、环境变量、API 供应商、权限绕过、远程控制、计划任务、开发者开关与自定义命令均不整份继承；技能与插件继续使用独立的继承逻辑。首次继承后用户在新环境的修改会保留。
