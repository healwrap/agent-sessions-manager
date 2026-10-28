#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod appearance;
mod local_backend;
mod resources;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex,
};
use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

#[derive(Default)]
struct Backend {
    child: Mutex<Option<CommandChild>>,
    generation: AtomicU64,
    paused: AtomicBool,
    failed: AtomicBool,
}

fn show(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.eval("window.agentSessionsWindowVisible=true;if(typeof loadTrace==='function'){loadTrace();loadSessions(false,true);}");
    }
}

fn stop(app: &tauri::AppHandle) {
    app.state::<Backend>()
        .generation
        .fetch_add(1, Ordering::SeqCst);
    if let Some(mut child) = app.state::<Backend>().child.lock().unwrap().take() {
        if child.write(b"shutdown\n").is_err() {
            let _ = child.kill();
        } else {
            local_backend::wait_for_shutdown();
        }
    }
}

#[tauri::command]
fn backend_status(app: tauri::AppHandle) -> bool {
    app.state::<Backend>().failed.load(Ordering::SeqCst)
}

#[tauri::command]
fn show_about(app: tauri::AppHandle) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        app.run_on_main_thread(|| {
            let main_thread = objc2::MainThreadMarker::new().expect("关于窗口需在主线程打开");
            objc2_app_kit::NSApplication::sharedApplication(main_thread)
                .orderFrontStandardAboutPanel(None);
        })
        .map_err(|error| error.to_string())?;
        Ok(None)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(Some(format!(
            "Agent Sessions\n版本 {}\n\n管理本地 Agent 会话、对话与轨迹。\n支持 Codex、Claude Code、Cursor、Antigravity、Antigravity CLI 和 DeepSeek Harness。",
            app.package_info().version
        )))
    }
}

#[tauri::command]
fn restart_backend(app: tauri::AppHandle) -> Result<(), String> {
    // The one-file sidecar serves assets from its extraction directory for its
    // entire lifetime. System temp cleanup can remove them while it is running.
    let runtime_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("backend-runtime");
    std::fs::create_dir_all(&runtime_dir).map_err(|e| e.to_string())?;
    stop(&app);
    app.state::<Backend>().failed.store(false, Ordering::SeqCst);
    if local_backend::available() {
        if let Some(window) = app.get_webview_window("main") {
            window
                .navigate(tauri::Url::parse(local_backend::URL).unwrap())
                .map_err(|error| error.to_string())?;
        }
        return Ok(());
    }
    let generation = app.state::<Backend>().generation.load(Ordering::SeqCst);
    let command = app
        .shell()
        .sidecar("agent-sessions-server")
        .map_err(|e| e.to_string())?
        .env("TMPDIR", &runtime_dir)
        .env("TMP", &runtime_dir)
        .env("TEMP", &runtime_dir)
        .args(["--port", "8766", "--desktop"]);
    let (mut rx, child) = command.spawn().map_err(|e| e.to_string())?;
    *app.state::<Backend>().child.lock().unwrap() = Some(child);
    tauri::async_runtime::spawn(async move {
        let mut ready = false;
        while let Some(event) = rx.recv().await {
            if app.state::<Backend>().generation.load(Ordering::SeqCst) != generation {
                break;
            }
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    if text.starts_with("http://127.0.0.1:") && !ready {
                        if let Ok(url) = tauri::Url::parse(text.trim()) {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.navigate(url);
                            }
                            ready = true;
                        }
                    }
                }
                CommandEvent::Terminated(_) | CommandEvent::Error(_) => {
                    app.state::<Backend>().failed.store(true, Ordering::SeqCst);
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window
                            .navigate(tauri::Url::parse("tauri://localhost/index.html").unwrap());
                    }
                    break;
                }
                _ => {}
            }
        }
    });
    Ok(())
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show(app)))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .manage(Backend::default())
        .invoke_handler(tauri::generate_handler![restart_backend, backend_status, show_about, appearance::set_theme, resources::open_resource])
        .on_page_load(|window, _| {
            let preference = appearance::saved_preference(window.app_handle());
            let _ = window.eval(&format!("localStorage.setItem('agent-sessions-theme','{preference}');"));
            let paused = window.state::<Backend>().paused.load(Ordering::SeqCst);
            let platform = std::env::consts::OS;
            let _ = window.eval(&format!("window.agentSessionsDesktop=true;window.agentSessionsPlatform='{platform}';window.agentSessionsPaused={paused};document.documentElement.classList.add('desktop-host','desktop-{platform}');"));
            if window.state::<Backend>().failed.load(Ordering::SeqCst) {
                let _ = window.eval("var status=document.getElementById('status');if(status)status.textContent='后台已停止，点击重新启动恢复。';");
            }
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if let Some(webview) = window.get_webview_window("main") { let _ = webview.eval("window.agentSessionsWindowVisible=false;"); }
                let _ = window.hide();
            }
        })
        .setup(|app| {
            appearance::set_theme(app.handle().clone(), appearance::saved_preference(app.handle()))
                .map_err(std::io::Error::other)?;
            let open = MenuItem::with_id(app, "open", "打开 Agent Sessions", true, None::<&str>)?;
            let pause = CheckMenuItem::with_id(app, "pause", "暂停同步", true, false, None::<&str>)?;
            let login = CheckMenuItem::with_id(app, "login", "登录时启动", true, app.autolaunch().is_enabled().unwrap_or(false), None::<&str>)?;
            let restart = MenuItem::with_id(app, "restart", "重启后台", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &pause, &login, &restart, &quit])?;
            let tray_icon = if cfg!(target_os = "macos") {
                tauri::include_image!("./icons/tray.png")
            } else {
                app.default_window_icon().unwrap().clone()
            };
            TrayIconBuilder::new().icon(tray_icon).icon_as_template(cfg!(target_os = "macos")).tooltip("Agent Sessions")
                .menu(&menu).on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => show(app),
                    "pause" => {
                        let paused = pause.is_checked().unwrap_or(false);
                        app.state::<Backend>().paused.store(paused, Ordering::SeqCst);
                        if let Some(window) = app.get_webview_window("main") { let _ = window.eval(&format!("window.agentSessionsPaused={paused};")); }
                    }
                    "login" => {
                        let result = if login.is_checked().unwrap_or(false) { app.autolaunch().enable() } else { app.autolaunch().disable() };
                        if result.is_err() { let _ = login.set_checked(app.autolaunch().is_enabled().unwrap_or(false)); }
                    }
                    "restart" => { let _ = restart_backend(app.clone()); }
                    "quit" => { stop(app); app.exit(0); }
                    _ => {}
                }).build(app)?;
            restart_backend(app.handle().clone()).map_err(std::io::Error::other)?;
            Ok(())
        })
        .build(tauri::generate_context!()).expect("无法启动 Agent Sessions");
    app.run(|app, event| match event {
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => show(app),
        RunEvent::Exit => stop(app),
        _ => {}
    });
}
