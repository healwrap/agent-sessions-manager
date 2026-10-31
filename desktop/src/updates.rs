use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Clone, Default, Serialize)]
pub struct UpdateView {
    state: String,
    current_version: String,
    new_version: String,
    notes: String,
    downloaded: u64,
    total: Option<u64>,
    error: String,
}

#[derive(Default)]
struct Inner {
    view: UpdateView,
    update: Option<Update>,
    bytes: Option<Vec<u8>>,
}

#[derive(Default)]
pub struct AppUpdates(Mutex<Inner>);

fn fail(app: &tauri::AppHandle, message: String, state: &str) -> UpdateView {
    let store = app.state::<AppUpdates>();
    let mut inner = store.0.lock().unwrap();
    inner.view.state = state.into();
    inner.view.error = message;
    inner.view.clone()
}

#[tauri::command]
pub fn app_update_status(app: tauri::AppHandle) -> UpdateView {
    let store = app.state::<AppUpdates>();
    let mut inner = store.0.lock().unwrap();
    inner.view.current_version = app.package_info().version.to_string();
    if inner.view.state.is_empty() {
        inner.view.state = "idle".into();
    }
    inner.view.clone()
}

#[tauri::command]
pub async fn app_update_check(app: tauri::AppHandle) -> Result<UpdateView, String> {
    {
        let store = app.state::<AppUpdates>();
        let mut inner = store.0.lock().unwrap();
        if ["checking", "downloading", "ready", "installing"].contains(&inner.view.state.as_str()) {
            return Ok(inner.view.clone());
        }
        inner.view = UpdateView {
            state: "checking".into(),
            current_version: app.package_info().version.to_string(),
            ..Default::default()
        };
        inner.update = None;
        inner.bytes = None;
    }
    let result = match app
        .updater_builder()
        .timeout(Duration::from_secs(60))
        .build()
    {
        Ok(updater) => updater.check().await,
        Err(error) => Err(error),
    };
    match result {
        Ok(update) => {
            let store = app.state::<AppUpdates>();
            let mut inner = store.0.lock().unwrap();
            if let Some(update) = update {
                // The native plugin verifies both the artifact signature and its signed version.
                inner.view.state = "available".into();
                inner.view.new_version = update.version.clone();
                inner.view.notes = update.body.clone().unwrap_or_default();
                inner.update = Some(update);
            } else {
                inner.view.state = "current".into();
            }
            Ok(inner.view.clone())
        }
        Err(tauri_plugin_updater::Error::ReleaseNotFound) => Ok(fail(
            &app,
            "暂未找到已发布的更新，请稍后重试。".into(),
            "unpublished",
        )),
        Err(error) => Ok(fail(&app, format!("检查更新失败：{error}"), "error")),
    }
}

#[tauri::command]
pub async fn app_update_download(app: tauri::AppHandle) -> Result<UpdateView, String> {
    let update = {
        let store = app.state::<AppUpdates>();
        let mut inner = store.0.lock().unwrap();
        if !["available", "error"].contains(&inner.view.state.as_str()) {
            return Err("请先检查可用更新".into());
        }
        let update = inner.update.clone().ok_or("请先检查可用更新")?;
        inner.view.state = "downloading".into();
        inner.view.downloaded = 0;
        inner.view.total = None;
        inner.view.error.clear();
        update
    };
    let result = update
        .download(
            |length, total| {
                let store = app.state::<AppUpdates>();
                let mut inner = store.0.lock().unwrap();
                inner.view.downloaded += length as u64;
                inner.view.total = total;
            },
            || {},
        )
        .await;
    match result {
        Ok(bytes) => {
            let store = app.state::<AppUpdates>();
            let mut inner = store.0.lock().unwrap();
            inner.bytes = Some(bytes);
            inner.view.state = "ready".into();
            Ok(inner.view.clone())
        }
        Err(error) => Ok(fail(&app, format!("下载或校验更新失败：{error}"), "error")),
    }
}

#[tauri::command]
pub async fn app_update_install(app: tauri::AppHandle) -> Result<UpdateView, String> {
    let (update, bytes) = {
        let store = app.state::<AppUpdates>();
        let mut inner = store.0.lock().unwrap();
        if inner.view.state != "ready" {
            return Err("请先下载并校验更新".into());
        }
        let update = inner.update.clone().ok_or("更新信息已失效，请重新检查")?;
        let bytes = inner.bytes.take().ok_or("更新包已失效，请重新下载")?;
        inner.view.state = "installing".into();
        inner.view.error.clear();
        (update, bytes)
    };
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = crate::local_backend::update_command("prepare") {
            let store = app.state::<AppUpdates>();
            store.0.lock().unwrap().bytes = Some(bytes);
            return fail(&app, error, "ready");
        }
        crate::stop(&app);
        if crate::local_backend::available() {
            let _ = crate::local_backend::update_command("cancel");
            let store = app.state::<AppUpdates>();
            store.0.lock().unwrap().bytes = Some(bytes);
            return fail(
                &app,
                "另一个管理器仍在使用后台，请先退出它再安装更新".into(),
                "ready",
            );
        }
        if let Err(error) = update.install(&bytes) {
            let _ = crate::restart_backend(app.clone());
            let store = app.state::<AppUpdates>();
            store.0.lock().unwrap().bytes = Some(bytes);
            return fail(
                &app,
                format!("安装未完成，已尝试恢复后台：{error}"),
                "ready",
            );
        }
        app.restart();
    })
    .await
    .map_err(|error| error.to_string())
}
