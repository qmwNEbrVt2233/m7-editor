use std::path::Path;

use serde_json::Value;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::video_export::{
    file::{cancel_video_export_file_inner, normalized_export_key},
    VideoExportRuntime,
};

const VIDEO_EXPORT_RENDER_WINDOW_LABEL: &str = "video-export-render";
// MCP frame captures use their own surface so they can run during video export.
const VIDEO_FRAME_RENDER_WINDOW_LABEL: &str = "video-frame-render";

fn is_valid_uuid_v4_like(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    bytes.iter().enumerate().all(|(index, &byte)| match index {
        8 | 13 | 18 | 23 => byte == b'-',
        _ => byte.is_ascii_hexdigit(),
    })
}

fn is_frame_capture_job(job: &Value) -> bool {
    job.get("frameCapture").and_then(Value::as_object).is_some()
}

#[tauri::command]
pub(crate) async fn create_video_export_render_window(
    app: AppHandle,
    runtime: State<'_, VideoExportRuntime>,
    job_id: String,
    job: Value,
    width: u32,
    height: u32,
) -> Result<(), String> {
    if !is_valid_uuid_v4_like(&job_id) {
        return Err("视频导出任务标识无效".to_string());
    }
    if width < 16
        || width > 7680
        || height < 16
        || height > 4320
        || width % 2 != 0
        || height % 2 != 0
    {
        return Err("独立渲染窗口尺寸无效".to_string());
    }
    let is_frame_capture = is_frame_capture_job(&job);
    let (window_label, query_parameter, already_running_message) = if is_frame_capture {
        (
            VIDEO_FRAME_RENDER_WINDOW_LABEL,
            "videoFrameRender",
            "已有帧截图渲染窗口正在运行",
        )
    } else {
        (
            VIDEO_EXPORT_RENDER_WINDOW_LABEL,
            "videoExportRender",
            "已有视频导出渲染窗口正在运行",
        )
    };
    if app.get_webview_window(window_label).is_some() {
        return Err(already_running_message.to_string());
    }

    {
        let mut jobs = runtime
            .render_jobs
            .lock()
            .map_err(|_| "视频导出任务状态不可用".to_string())?;
        // Prune stale jobs for this window type since the window is guaranteed not open.
        jobs.retain(|_, existing| is_frame_capture_job(existing) != is_frame_capture);
        jobs.insert(job_id.clone(), job);
    }

    let url = format!("index.html?{query_parameter}={job_id}");
    let window = WebviewWindowBuilder::new(&app, window_label, WebviewUrl::App(url.into()))
        .inner_size(width as f64, height as f64)
        .min_inner_size(width as f64, height as f64)
        .max_inner_size(width as f64, height as f64)
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        // WKWebView stops producing reliable snapshots when its window is covered on macOS.
        // Keep the render surface above other windows without activating it.
        // WebView2 does not have the same visibility requirement.
        .always_on_top(cfg!(target_os = "macos"))
        .focused(false)
        .focusable(!cfg!(target_os = "macos"))
        .visible_on_all_workspaces(cfg!(target_os = "macos"))
        .visible(cfg!(target_os = "macos"))
        .build();

    if let Err(error) = window {
        if let Ok(mut jobs) = runtime.render_jobs.lock() {
            jobs.remove(&job_id);
        }
        return Err(format!("无法创建独立视频渲染窗口: {error}"));
    }

    #[cfg(target_os = "macos")]
    if let Some(window) = app.get_webview_window(window_label) {
        // `visible(true)` is applied while building the native window, but
        // explicitly showing it here also covers macOS versions that
        // defer ordering a non-focused window until after navigation.
        if let Err(error) = window
            .show()
            .map_err(|error| format!("显示独立视频渲染窗口失败: {error}"))
            .and_then(|_| {
                window
                    .set_always_on_top(true)
                    .map_err(|error| format!("设置独立视频渲染窗口层级失败: {error}"))
            })
        {
            let _ = window.close();
            if let Ok(mut jobs) = runtime.render_jobs.lock() {
                jobs.remove(&job_id);
            }
            return Err(error);
        }
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn get_video_export_render_job(
    runtime: State<'_, VideoExportRuntime>,
    job_id: String,
) -> Result<Value, String> {
    runtime
        .render_jobs
        .lock()
        .map_err(|_| "视频导出任务状态不可用".to_string())?
        .get(&job_id)
        .cloned()
        .ok_or_else(|| "独立视频渲染任务不存在".to_string())
}

#[tauri::command]
pub(crate) async fn finish_video_export_render_window(
    app: AppHandle,
    runtime: State<'_, VideoExportRuntime>,
    job_id: String,
    keep_output: bool,
) -> Result<(), String> {
    let job = runtime
        .render_jobs
        .lock()
        .map_err(|_| "视频导出任务状态不可用".to_string())?
        .remove(&job_id);

    if !keep_output {
        if let Some(output_path) = job
            .as_ref()
            .and_then(|value| value.get("outputPath"))
            .and_then(Value::as_str)
            .map(str::to_string)
        {
            let key = normalized_export_key(Path::new(&output_path));
            let session = runtime
                .ffmpeg_processes
                .lock()
                .ok()
                .and_then(|mut processes| processes.remove(&key));
            let app_clone = app.clone();
            let output_clone = output_path.clone();
            let _ = tauri::async_runtime::spawn_blocking(move || {
                if let Some(session) = session {
                    session.terminate();
                }
                let rt = app_clone.state::<VideoExportRuntime>();
                let _ = cancel_video_export_file_inner(&rt, output_clone);
            })
            .await;
        }
    }

    if let Some(job) = job.as_ref() {
        let window_label = if is_frame_capture_job(job) {
            VIDEO_FRAME_RENDER_WINDOW_LABEL
        } else {
            VIDEO_EXPORT_RENDER_WINDOW_LABEL
        };
        if let Some(window) = app.get_webview_window(window_label) {
            window
                .close()
                .map_err(|error| format!("关闭独立渲染窗口失败: {error}"))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uuid_v4_like_validation_checks_format() {
        assert!(is_valid_uuid_v4_like("550e8400-e29b-41d4-a716-446655440000"));
        assert!(!is_valid_uuid_v4_like("550e8400e29b-41d4-a716-446655440000"));
        assert!(!is_valid_uuid_v4_like("not-a-uuid"));
    }
}
