use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::dialogs::{open_media_file_dialog, run_platform_dialog};

#[derive(Serialize)]
pub(crate) struct MediaFile {
    pub(crate) path: String,
}

pub(crate) fn canonical_media_file(path: impl AsRef<Path>) -> Result<PathBuf, String> {
    let path = path.as_ref();
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("无法读取媒体文件路径: {error}"))?;

    if !canonical.is_file() {
        return Err("选择的路径不是文件".to_string());
    }

    Ok(canonical)
}

pub(crate) fn register_media_path(app: &AppHandle, path: PathBuf) -> Result<MediaFile, String> {
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|error| format!("无法授权媒体文件读取: {error}"))?;

    Ok(MediaFile {
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub(crate) fn register_media_file(app: AppHandle, path: String) -> Result<MediaFile, String> {
    let path = canonical_media_file(path)?;
    register_media_path(&app, path)
}

#[tauri::command]
pub(crate) async fn open_media_file(app: AppHandle) -> Result<Option<MediaFile>, String> {
    let Some(path) = run_platform_dialog(&app, open_media_file_dialog, "媒体文件选择器").await?
    else {
        return Ok(None);
    };

    let path = canonical_media_file(path)?;
    register_media_path(&app, path).map(Some)
}
