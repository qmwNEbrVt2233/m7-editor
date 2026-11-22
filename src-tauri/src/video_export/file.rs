use std::{
    fs::{self, File, OpenOptions},
    io::{Seek, SeekFrom, Write},
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex},
};

use tauri::{
    ipc::{InvokeBody, Request},
    AppHandle, Manager, State,
};

use crate::{
    dialogs::{run_platform_dialog, save_video_file_dialog},
    fs_utils::{is_windows_reserved_name, sanitize_file_name_core},
    video_export::{decode_hex_utf8, header_str, parse_json_byte_array, VideoExportRuntime},
};

fn normalize_video_export_default_filename(default_file_name: Option<&str>) -> String {
    let Some(raw) = default_file_name else {
        return "m7-export.mp4".to_string();
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "m7-export.mp4".to_string();
    }
    let stem = match trimmed.as_bytes() {
        bytes if bytes.len() >= 4 && bytes[bytes.len() - 4..].eq_ignore_ascii_case(b".mp4") => {
            &trimmed[..trimmed.len() - 4]
        }
        _ => trimmed,
    };
    match sanitize_file_name_core(stem) {
        Some(clean_stem) => format!("{clean_stem}.mp4"),
        None => "m7-export.mp4".to_string(),
    }
}

#[tauri::command]
pub(crate) async fn choose_video_export_path(
    app: AppHandle,
    default_file_name: Option<String>,
) -> Result<Option<String>, String> {
    let resolved_default_name =
        normalize_video_export_default_filename(default_file_name.as_deref());

    let selected = run_platform_dialog(
        &app,
        move || save_video_file_dialog(&resolved_default_name),
        "视频保存对话框",
    )
    .await?;

    Ok(selected.map(|path| path.to_string_lossy().into_owned()))
}

pub(crate) fn validate_video_export_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() || path.contains('\0') {
        return Err("视频导出路径不能为空或包含空字符".to_string());
    }
    let path_buf = PathBuf::from(path);
    if !path_buf.is_absolute() {
        return Err("视频导出路径必须是绝对路径".to_string());
    }
    if path_buf
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("视频导出路径不能包含 .. 路径段".to_string());
    }
    if path_buf
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(is_windows_reserved_name)
    {
        return Err("视频导出文件名不能使用系统保留设备名".to_string());
    }
    if path_buf
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        != Some("mp4".to_string())
    {
        return Err("视频导出文件必须使用 .mp4 扩展名".to_string());
    }
    Ok(path_buf)
}

pub(crate) fn normalized_export_key(path: &Path) -> PathBuf {
    if let (Some(parent), Some(file_name)) = (path.parent(), path.file_name()) {
        if let Ok(canonical_parent) = parent.canonicalize() {
            return canonical_parent.join(file_name);
        }
    }
    path.to_path_buf()
}

pub(crate) fn prepare_video_export_path_inner(path: &str) -> Result<PathBuf, String> {
    let path = validate_video_export_path(path)?;
    if path.is_dir() {
        return Err(format!("视频导出路径不能是目录: {}", path.display()));
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("无法创建导出目录 {}: {error}", parent.display()))?;
        }
    }
    Ok(path)
}

#[tauri::command]
pub(crate) fn prepare_video_export_path(path: String) -> Result<String, String> {
    let prepared = prepare_video_export_path_inner(&path)?;
    Ok(prepared.to_string_lossy().to_string())
}

#[tauri::command]
pub(crate) async fn start_video_export_file(app: AppHandle, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = app.state::<VideoExportRuntime>();
        let path = prepare_video_export_path_inner(&path)?;
        let key = normalized_export_key(&path);
        {
            let files = runtime
                .export_files
                .lock()
                .map_err(|_| "视频导出文件状态不可用".to_string())?;
            if files.contains_key(&key) {
                return Err("该导出文件正在写入中".to_string());
            }
        }
        let file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&path)
            .map_err(|error| format!("无法创建导出文件 {}: {error}", path.display()))?;
        let mut files = runtime
            .export_files
            .lock()
            .map_err(|_| "视频导出文件状态不可用".to_string())?;
        if files.contains_key(&key) {
            return Err("该导出文件正在写入中".to_string());
        }
        files.insert(key, Arc::new(Mutex::new(file)));
        Ok(())
    })
    .await
    .map_err(|error| format!("启动导出文件写入失败: {error}"))?
}

#[tauri::command]
pub(crate) fn write_video_export_chunk(
    runtime: State<'_, VideoExportRuntime>,
    request: Request<'_>,
) -> Result<(), String> {
    let (path_str, position, owned_json_data): (String, u64, Option<Vec<u8>>) = match request.body()
    {
        InvokeBody::Raw(_) => {
            let path_hex = header_str(&request, "x-export-path-hex")?;
            let path = decode_hex_utf8(path_hex)?;
            let position = header_str(&request, "x-position")?
                .parse::<u64>()
                .map_err(|_| "x-position 请求头无效".to_string())?;
            (path, position, None)
        }
        InvokeBody::Json(value) => {
            let path = value
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "缺少导出文件路径".to_string())?
                .to_string();
            let position = value
                .get("position")
                .and_then(|v| v.as_u64())
                .ok_or_else(|| "缺少写入偏移位置".to_string())?;
            let data_value = value
                .get("data")
                .ok_or_else(|| "缺少写入字节数据".to_string())?;
            let data = parse_json_byte_array(data_value, "写入字节数据")?;
            (path, position, Some(data))
        }
    };

    let bytes: &[u8] = match (&owned_json_data, request.body()) {
        (Some(vec), _) => vec.as_slice(),
        (None, InvokeBody::Raw(raw)) => raw.as_slice(),
        _ => unreachable!(),
    };
    if position.checked_add(bytes.len() as u64).is_none() {
        return Err("导出文件写入偏移量溢出".to_string());
    }

    let path = validate_video_export_path(&path_str)?;
    let key = normalized_export_key(&path);
    let file_handle: Arc<Mutex<File>> = {
        let mut files = runtime
            .export_files
            .lock()
            .map_err(|_| "视频导出文件状态不可用".to_string())?;
        if let Some(existing) = files.get(&key) {
            Arc::clone(existing)
        } else {
            let reopened = OpenOptions::new()
                .write(true)
                .open(&path)
                .map_err(|error| format!("无法打开导出文件 {}: {error}", path.display()))?;
            let handle = Arc::new(Mutex::new(reopened));
            files.insert(key, Arc::clone(&handle));
            handle
        }
    };

    let mut file = file_handle
        .lock()
        .map_err(|_| "导出文件写入锁不可用".to_string())?;
    file.seek(SeekFrom::Start(position))
        .and_then(|_| file.write_all(bytes))
        .map_err(|error| format!("写入导出文件失败: {error}"))
}

#[tauri::command]
pub(crate) async fn finish_video_export_file(
    app: AppHandle,
    path: String,
    file_size: u64,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = app.state::<VideoExportRuntime>();
        let path = validate_video_export_path(&path)?;
        let key = normalized_export_key(&path);
        let cached_file = runtime
            .export_files
            .lock()
            .map_err(|_| "视频导出文件状态不可用".to_string())?
            .remove(&key);
        match cached_file {
            Some(arc_file) => match Arc::try_unwrap(arc_file) {
                Ok(mutex) => {
                    let file = mutex
                        .into_inner()
                        .map_err(|_| "导出文件句柄状态异常".to_string())?;
                    file.set_len(file_size)
                        .and_then(|_| file.sync_all())
                        .map_err(|error| format!("最终化导出文件失败: {error}"))
                }
                Err(arc_file) => {
                    let file = arc_file
                        .lock()
                        .map_err(|_| "导出文件句柄锁定失败".to_string())?;
                    file.set_len(file_size)
                        .and_then(|_| file.sync_all())
                        .map_err(|error| format!("最终化导出文件失败: {error}"))
                }
            },
            None => {
                let file = OpenOptions::new()
                    .write(true)
                    .open(&path)
                    .map_err(|error| format!("无法最终化导出文件 {}: {error}", path.display()))?;
                file.set_len(file_size)
                    .and_then(|_| file.sync_all())
                    .map_err(|error| format!("最终化导出文件失败: {error}"))
            }
        }
    })
    .await
    .map_err(|error| format!("完成导出文件失败: {error}"))?
}

pub(crate) fn cancel_video_export_file_inner(
    runtime: &VideoExportRuntime,
    path: String,
) -> Result<(), String> {
    let path = validate_video_export_path(&path)?;
    let key = normalized_export_key(&path);
    if let Ok(mut files) = runtime.export_files.lock() {
        // Drop the cached File handle before removing the file (required on Windows)
        files.remove(&key);
        files.remove(&path);
    }
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("删除未完成的导出文件失败: {error}")),
    }
}

#[tauri::command]
pub(crate) async fn cancel_video_export_file(app: AppHandle, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = app.state::<VideoExportRuntime>();
        cancel_video_export_file_inner(&runtime, path)
    })
    .await
    .map_err(|error| format!("取消导出文件失败: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fs_utils::unique_test_dir;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn cancel_video_export_file_drops_cached_handle_and_removes_file() {
        let dir = std::env::temp_dir();
        let file_path = dir.join(format!(
            "m7_export_test_{}.mp4",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path_str = file_path.to_string_lossy().to_string();

        let runtime = VideoExportRuntime::default();
        let file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&file_path)
            .unwrap();
        runtime
            .export_files
            .lock()
            .unwrap()
            .insert(normalized_export_key(&file_path), Arc::new(Mutex::new(file)));

        cancel_video_export_file_inner(&runtime, path_str).unwrap();
        assert!(!file_path.exists());
        assert!(runtime.export_files.lock().unwrap().is_empty());
    }

    #[test]
    fn prepare_video_export_path_validates_and_creates_parent() {
        let root = unique_test_dir("m7_editor_export_path_test");
        let nested_mp4 = root.join("nested").join("output.mp4");
        let prepared = prepare_video_export_path_inner(&nested_mp4.to_string_lossy()).unwrap();
        assert_eq!(prepared, nested_mp4);
        assert!(root.join("nested").is_dir());

        assert!(prepare_video_export_path_inner("relative/output.mp4").is_err());
        assert!(
            prepare_video_export_path_inner(&root.join("..").join("output.mp4").to_string_lossy())
                .is_err()
        );

        let wrong_ext = root.join("output.mov");
        assert!(prepare_video_export_path_inner(&wrong_ext.to_string_lossy()).is_err());

        let reserved = root.join("CON.mp4");
        assert!(prepare_video_export_path_inner(&reserved.to_string_lossy()).is_err());

        let dir_named_mp4 = root.join("folder.mp4");
        fs::create_dir_all(&dir_named_mp4).unwrap();
        assert!(prepare_video_export_path_inner(&dir_named_mp4.to_string_lossy()).is_err());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn normalize_video_export_default_filename_handles_project_names_and_fallbacks() {
        assert_eq!(
            normalize_video_export_default_filename(None),
            "m7-export.mp4"
        );
        assert_eq!(
            normalize_video_export_default_filename(Some("   ")),
            "m7-export.mp4"
        );
        assert_eq!(
            normalize_video_export_default_filename(Some("我的工程")),
            "我的工程.mp4"
        );
        assert_eq!(
            normalize_video_export_default_filename(Some("demo.MP4")),
            "demo.mp4"
        );
        assert_eq!(
            normalize_video_export_default_filename(Some("bad:name/v1")),
            "bad_name_v1.mp4"
        );
        assert_eq!(
            normalize_video_export_default_filename(Some("...mp4")),
            "m7-export.mp4"
        );
        assert_eq!(
            normalize_video_export_default_filename(Some("CON.mp4")),
            "_CON.mp4"
        );
    }
}
