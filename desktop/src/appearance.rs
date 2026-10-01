use tauri::Manager;

// Same app-owned settings directory as backend/agent_sessions/paths.py.
pub fn saved_preference(app: &tauri::AppHandle) -> String {
    let Ok(home) = app.path().home_dir() else { return "system".into() };
    let directory = if cfg!(target_os = "macos") {
        home.join("Library/Application Support/Agent Sessions")
    } else if cfg!(target_os = "windows") {
        std::env::var_os("LOCALAPPDATA").or_else(|| std::env::var_os("APPDATA"))
            .map(std::path::PathBuf::from).unwrap_or_else(|| home.join("AppData/Local"))
            .join("Agent Sessions")
    } else {
        std::env::var_os("XDG_DATA_HOME").map(std::path::PathBuf::from)
            .filter(|p| p.is_absolute()).unwrap_or_else(|| home.join(".local/share"))
            .join("agent-sessions")
    };
    let value = std::fs::read(directory.join("settings.json")).ok()
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok());
    match value.as_ref().and_then(|v| v.get("theme")).and_then(|v| v.as_str()) {
        Some("dark") => "dark", Some("light") => "light", _ => "system",
    }.into()
}

#[tauri::command]
pub fn set_theme(app: tauri::AppHandle, preference: String) -> Result<(), String> {
    let theme = match preference.as_str() {
        "dark" => Some(tauri::Theme::Dark),
        "light" => Some(tauri::Theme::Light),
        "system" => None,
        _ => return Err("外观设置无效".into()),
    };
    app.set_theme(theme);
    Ok(())
}
