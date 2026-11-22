use std::{
    collections::HashSet,
    fs::OpenOptions,
    io::{Read, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};

use tauri::{
    ipc::{InvokeBody, Request},
    AppHandle, Manager, State,
};

use crate::{
    fs_utils::paths_refer_to_same_entry,
    video_export::{
        decode_hex_utf8,
        file::{
            cancel_video_export_file_inner, normalized_export_key, prepare_video_export_path_inner,
            validate_video_export_path,
        },
        header_str, parse_json_byte_array, VideoExportRuntime,
    },
};

const MAX_FFMPEG_STDERR_BYTES: usize = 8192;

pub(crate) struct FfmpegSession {
    stdin: Mutex<Option<ChildStdin>>,
    child: Mutex<Option<Child>>,
    stderr_tail: Arc<Mutex<String>>,
    stderr_thread: Mutex<Option<thread::JoinHandle<()>>>,
    expected_rgba_frame_bytes: Option<usize>,
}

impl FfmpegSession {
    pub(crate) fn terminate(&self) {
        // Kill the child first so any blocked stdin.write_all wakes with BrokenPipe.
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
        if let Ok(mut guard) = self.stdin.lock() {
            guard.take();
        }
        if let Ok(mut guard) = self.stderr_thread.lock() {
            if let Some(handle) = guard.take() {
                let _ = handle.join();
            }
        }
    }
}

fn ffmpeg_command(app: &AppHandle) -> Command {
    let executable_name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    if let Ok(resource_dir) = app.path().resource_dir() {
        for relative_path in [
            PathBuf::from(executable_name),
            PathBuf::from("ffmpeg").join(executable_name),
            PathBuf::from("binaries").join(executable_name),
        ] {
            let candidate = resource_dir.join(relative_path);
            if candidate.is_file() {
                return command_without_console(candidate);
            }
        }
    }

    command_without_console("ffmpeg")
}

fn command_without_console(program: impl AsRef<std::ffi::OsStr>) -> Command {
    #[cfg(windows)]
    let mut command = Command::new(program);
    #[cfg(not(windows))]
    let command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command
}

#[tauri::command]
pub(crate) async fn can_use_ffmpeg_video_encoder(app: AppHandle) -> bool {
    tauri::async_runtime::spawn_blocking(move || ffmpeg_has_encoder(&app, "libx264"))
        .await
        .unwrap_or(false)
}

fn ffmpeg_has_encoder(app: &AppHandle, name: &str) -> bool {
    let Ok(output) = ffmpeg_command(app)
        .args(["-hide_banner", "-encoders"])
        .output()
    else {
        return false;
    };

    if !output.status.success() {
        return false;
    }

    let encoders = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    encoders
        .lines()
        .any(|line| line.split_whitespace().any(|part| part == name))
}

struct PendingFfmpegKeyGuard<'a> {
    set: &'a Mutex<HashSet<PathBuf>>,
    key: PathBuf,
}

impl Drop for PendingFfmpegKeyGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.set.lock() {
            guard.remove(&self.key);
        }
    }
}

#[tauri::command]
pub(crate) async fn start_ffmpeg_video_export(
    app: AppHandle,
    output_path: String,
    media_path: Option<String>,
    quality: String,
    fps: f64,
    start_ms: f64,
    end_ms: f64,
    frame_count: u64,
    width: u32,
    height: u32,
    pixel_format: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = app.state::<VideoExportRuntime>();
        let crf = match quality.as_str() {
            "low" => "32",
            "high" => "20",
            "very-high" => "16",
            "near-lossless" => "0",
            _ => return Err("FFmpeg 视频质量选项无效".to_string()),
        };
        if !fps.is_finite()
            || fps <= 0.0
            || fps > 240.0
            || !start_ms.is_finite()
            || start_ms < 0.0
            || !end_ms.is_finite()
            || end_ms <= start_ms
            || frame_count == 0
            || width < 16
            || width > 7680
            || height < 16
            || height > 4320
            || width % 2 != 0
            || height % 2 != 0
        {
            return Err("FFmpeg 视频导出参数无效".to_string());
        }

        let input_pix_fmt = pixel_format.unwrap_or_else(|| "png".to_string());
        let expected_rgba_frame_bytes = match input_pix_fmt.as_str() {
            "rgba" => {
                let bytes = (width as usize)
                    .checked_mul(height as usize)
                    .and_then(|pixels| pixels.checked_mul(4))
                    .ok_or_else(|| "FFmpeg 视频帧尺寸超出内存限制".to_string())?;
                Some(bytes)
            }
            "png" => None,
            _ => return Err("FFmpeg 帧像素格式无效".to_string()),
        };

        let output = prepare_video_export_path_inner(&output_path)?;
        let key = normalized_export_key(&output);

        let media = media_path
            .as_deref()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .map(PathBuf::from);
        if let Some(media_path_ref) = media.as_ref() {
            if !media_path_ref.is_absolute() || !media_path_ref.is_file() {
                return Err("FFmpeg 后备导出需要可访问的本地源视频文件".to_string());
            }
            if let Ok(canonical_media) = media_path_ref.canonicalize() {
                if canonical_media == key || paths_refer_to_same_entry(&canonical_media, &output) {
                    return Err("导出目标文件不能与源媒体文件相同".to_string());
                }
            }
            if !ffmpeg_has_encoder(&app, "aac") {
                return Err("FFmpeg 缺少 AAC 编码器，无法封装源视频音轨".to_string());
            }
        }

        // Reserve key before spawning ffmpeg so concurrent calls cannot truncate an active output file.
        {
            let mut starting = runtime
                .starting_ffmpeg
                .lock()
                .map_err(|_| "FFmpeg 导出会话状态不可用".to_string())?;
            if starting.contains(&key) {
                return Err("该目标文件正在启动 FFmpeg 导出".to_string());
            }
            let sessions = runtime
                .ffmpeg_processes
                .lock()
                .map_err(|_| "FFmpeg 导出会话状态不可用".to_string())?;
            if sessions.contains_key(&key) {
                return Err("该目标文件已有正在运行的 FFmpeg 导出".to_string());
            }
            starting.insert(key.clone());
        }
        let _reserve_guard = PendingFfmpegKeyGuard {
            set: &runtime.starting_ffmpeg,
            key: key.clone(),
        };

        let duration_seconds = (end_ms - start_ms) / 1000.0;
        let mut process = ffmpeg_command(&app);
        process
            .arg("-hide_banner")
            .arg("-loglevel")
            .arg("error")
            .arg("-y");
        match input_pix_fmt.as_str() {
            "rgba" => {
                process
                    .arg("-f")
                    .arg("rawvideo")
                    .arg("-pix_fmt")
                    .arg("rgba")
                    .arg("-video_size")
                    .arg(format!("{width}x{height}"))
                    .arg("-framerate")
                    .arg(fps.to_string())
                    .arg("-i")
                    .arg("pipe:0");
            }
            "png" => {
                process
                    .arg("-f")
                    .arg("image2pipe")
                    .arg("-vcodec")
                    .arg("png")
                    .arg("-framerate")
                    .arg(fps.to_string())
                    .arg("-i")
                    .arg("pipe:0");
            }
            _ => unreachable!(),
        }
        if let Some(media) = media.as_ref() {
            process
                .arg("-ss")
                .arg((start_ms / 1000.0).to_string())
                .arg("-i")
                .arg(media);
        }
        process
            .arg("-map")
            .arg("0:v:0")
            .arg("-c:v")
            .arg("libx264")
            .arg("-crf")
            .arg(crf)
            .arg("-preset")
            .arg("fast")
            .arg("-pix_fmt")
            .arg("yuv420p")
            .arg("-frames:v")
            .arg(frame_count.to_string())
            .arg("-t")
            .arg(duration_seconds.to_string());
        if media.is_some() {
            process
                .arg("-map")
                .arg("1:a:0?")
                .arg("-c:a")
                .arg("aac")
                .arg("-b:a")
                .arg("192k");
        }
        process
            .arg("-movflags")
            .arg("+faststart")
            .arg(output.to_string_lossy().as_ref())
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());

        let mut child = process
            .spawn()
            .map_err(|error| format!("无法启动 FFmpeg 后备编码器: {error}"))?;
        let stdin = child.stdin.take();
        let stderr = child.stderr.take();
        let stderr_tail = Arc::new(Mutex::new(String::new()));
        let stderr_tail_clone = Arc::clone(&stderr_tail);
        let stderr_thread = stderr
            .map(|mut pipe| {
                thread::Builder::new()
                    .name("m7-ffmpeg-stderr".to_string())
                    .spawn(move || {
                        let mut collected = Vec::new();
                        let mut chunk = [0u8; 1024];
                        loop {
                            match pipe.read(&mut chunk) {
                                Ok(0) | Err(_) => break,
                                Ok(n) => {
                                    if collected.len() < MAX_FFMPEG_STDERR_BYTES {
                                        let remain = MAX_FFMPEG_STDERR_BYTES - collected.len();
                                        collected.extend_from_slice(&chunk[..n.min(remain)]);
                                    }
                                }
                            }
                        }
                        if !collected.is_empty() {
                            if let Ok(mut guard) = stderr_tail_clone.lock() {
                                *guard = String::from_utf8_lossy(&collected).trim().to_string();
                            }
                        }
                    })
                    .ok()
            })
            .flatten();

        let session = Arc::new(FfmpegSession {
            stdin: Mutex::new(stdin),
            child: Mutex::new(Some(child)),
            stderr_tail,
            stderr_thread: Mutex::new(stderr_thread),
            expected_rgba_frame_bytes,
        });

        let mut sessions = runtime
            .ffmpeg_processes
            .lock()
            .map_err(|_| "FFmpeg 导出会话状态不可用".to_string())?;
        if sessions.contains_key(&key) {
            session.terminate();
            return Err("该目标文件已有正在运行的 FFmpeg 导出".to_string());
        }
        sessions.insert(key, session);
        Ok(())
    })
    .await
    .map_err(|error| format!("启动 FFmpeg 导出失败: {error}"))?
}

#[tauri::command]
pub(crate) fn write_ffmpeg_video_frame(
    runtime: State<'_, VideoExportRuntime>,
    request: Request<'_>,
) -> Result<(), String> {
    let (output_path, owned_json_frame): (String, Option<Vec<u8>>) = match request.body() {
        InvokeBody::Raw(_) => {
            let path_hex = header_str(&request, "x-output-path-hex")?;
            (decode_hex_utf8(path_hex)?, None)
        }
        InvokeBody::Json(value) => {
            let output_path = value
                .get("outputPath")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "缺少 FFmpeg 导出路径".to_string())?
                .to_string();
            let frame_value = value
                .get("pngFrame")
                .ok_or_else(|| "缺少 FFmpeg 视频帧数据".to_string())?;
            let frame = parse_json_byte_array(frame_value, "FFmpeg 视频帧数据")?;
            (output_path, Some(frame))
        }
    };

    let bytes: &[u8] = match (&owned_json_frame, request.body()) {
        (Some(vec), _) => vec.as_slice(),
        (None, InvokeBody::Raw(raw)) => raw.as_slice(),
        _ => unreachable!(),
    };
    if bytes.is_empty() {
        return Err("FFmpeg 视频帧数据不能为空".to_string());
    }

    let path = validate_video_export_path(&output_path)?;
    let key = normalized_export_key(&path);
    let session = runtime
        .ffmpeg_processes
        .lock()
        .map_err(|_| "FFmpeg 导出会话状态不可用".to_string())?
        .get(&key)
        .cloned()
        .ok_or_else(|| "FFmpeg 导出会话不存在".to_string())?;

    if let Some(expected_len) = session.expected_rgba_frame_bytes {
        if bytes.len() != expected_len {
            return Err(format!(
                "FFmpeg RGBA 视频帧字节数无效：期望 {expected_len}，实际 {}",
                bytes.len()
            ));
        }
    }

    let mut stdin_guard = session
        .stdin
        .lock()
        .map_err(|_| "FFmpeg 帧输入锁不可用".to_string())?;
    stdin_guard
        .as_mut()
        .ok_or_else(|| "FFmpeg 视频帧输入已关闭".to_string())?
        .write_all(bytes)
        .map_err(|error| format!("向 FFmpeg 写入视频帧失败: {error}"))
}

#[tauri::command]
pub(crate) async fn finish_ffmpeg_video_export(
    app: AppHandle,
    output_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = app.state::<VideoExportRuntime>();
        let path = validate_video_export_path(&output_path)?;
        let key = normalized_export_key(&path);
        let session = runtime
            .ffmpeg_processes
            .lock()
            .map_err(|_| "FFmpeg 导出会话状态不可用".to_string())?
            .remove(&key)
            .ok_or_else(|| "FFmpeg 导出会话不存在".to_string())?;

        if let Ok(mut stdin_guard) = session.stdin.lock() {
            stdin_guard.take();
        }
        let status = {
            let mut child_guard = session
                .child
                .lock()
                .map_err(|_| "FFmpeg 进程锁不可用".to_string())?;
            let mut child = child_guard
                .take()
                .ok_or_else(|| "FFmpeg 导出进程已结束".to_string())?;
            child
                .wait()
                .map_err(|error| format!("等待 FFmpeg 完成失败: {error}"))?
        };
        if let Ok(mut stderr_guard) = session.stderr_thread.lock() {
            if let Some(handle) = stderr_guard.take() {
                let _ = handle.join();
            }
        }
        if !status.success() {
            let detail = session
                .stderr_tail
                .lock()
                .ok()
                .map(|guard| guard.clone())
                .unwrap_or_default();
            return if detail.is_empty() {
                Err(format!("FFmpeg 编码失败，退出状态: {status}"))
            } else {
                Err(format!("FFmpeg 编码失败（{status}）: {detail}"))
            };
        }

        OpenOptions::new()
            .write(true)
            .open(&path)
            .and_then(|file| file.sync_all())
            .map_err(|error| format!("无法同步 FFmpeg 输出文件: {error}"))
    })
    .await
    .map_err(|error| format!("完成 FFmpeg 导出失败: {error}"))?
}

#[tauri::command]
pub(crate) async fn cancel_ffmpeg_video_export(
    app: AppHandle,
    output_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = app.state::<VideoExportRuntime>();
        let validated = validate_video_export_path(&output_path)?;
        let key = normalized_export_key(&validated);
        let session = runtime
            .ffmpeg_processes
            .lock()
            .map_err(|_| "FFmpeg 导出会话状态不可用".to_string())?
            .remove(&key);
        if let Some(session) = session {
            session.terminate();
        }

        cancel_video_export_file_inner(&runtime, output_path)
    })
    .await
    .map_err(|error| format!("取消 FFmpeg 导出失败: {error}"))?
}
