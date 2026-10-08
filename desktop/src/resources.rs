use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

fn local_path(app: &tauri::AppHandle, target: &str, cwd: Option<&str>) -> Result<PathBuf, String> {
    let mut path = if let Some(rest) = target
        .strip_prefix("~/")
        .or_else(|| target.strip_prefix("~\\"))
    {
        app.path().home_dir().map_err(|e| e.to_string())?.join(rest)
    } else if PathBuf::from(target).is_absolute() {
        PathBuf::from(target)
    } else if let Ok(url) = tauri::Url::parse(target) {
        if url.scheme() != "file" {
            return Err("不支持打开此类链接".into());
        }
        url.to_file_path()
            .map_err(|_| "文件链接不属于当前系统".to_string())?
    } else {
        PathBuf::from(target)
    };
    if !path.is_absolute() {
        let root = cwd
            .filter(|root| PathBuf::from(root).is_absolute())
            .ok_or("此会话没有本地项目目录，无法打开相对文件路径")?;
        path = PathBuf::from(root).join(path);
    }
    // A source citation may end with :line or :line:column. Preserve actual
    // filenames containing a colon when the original path already exists.
    for _ in 0..2 {
        if path.exists() {
            break;
        }
        let value = path.to_string_lossy();
        let Some((base, line)) = value.rsplit_once(':') else {
            break;
        };
        if line.is_empty() || !line.bytes().all(|b| b.is_ascii_digit()) {
            break;
        }
        path = PathBuf::from(base);
    }
    if !path.exists() {
        return Err(format!("文件或文件夹不存在：{}", path.display()));
    }
    Ok(path)
}

#[tauri::command]
pub fn open_resource(
    app: tauri::AppHandle,
    target: String,
    cwd: Option<String>,
    reveal: bool,
) -> Result<(), String> {
    if target.is_empty() || target.chars().any(char::is_control) {
        return Err("链接地址无效".into());
    }
    if let Ok(url) = tauri::Url::parse(&target) {
        if matches!(url.scheme(), "http" | "https" | "mailto") {
            if reveal {
                return Err("网页链接不能在文件管理器中显示".into());
            }
            return app
                .opener()
                .open_url(url.to_string(), None::<&str>)
                .map_err(|e| e.to_string());
        }
    }
    let path = local_path(&app, &target, cwd.as_deref())?;
    if reveal {
        app.opener()
            .reveal_item_in_dir(path)
            .map_err(|e| e.to_string())
    } else {
        app.opener()
            .open_path(path.to_string_lossy(), None::<&str>)
            .map_err(|e| e.to_string())
    }
}
