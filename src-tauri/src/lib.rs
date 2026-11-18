use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{BufReader, BufWriter, Read, Seek, SeekFrom, Write},
    net::{TcpListener, TcpStream},
    path::{Component, Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

#[cfg(desktop)]
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    WindowEvent,
};

const APP_VERSION: &str = "1.12.0";
const APP_DIR_NAME: &str = "m7-editor";
const APP_CONFIG_FILE: &str = "config.json";
const PROJECT_CONFIG_FILE: &str = "project_config.json";
const MCP_DESCRIPTOR_PREFIX: &str = "m7-editor-mcp-bridge-";
const MCP_MAX_BODY_BYTES: usize = 1024 * 1024;
const MCP_MAX_HEADER_BYTES: usize = 8192;
const MCP_MAX_CONCURRENT_CONNECTIONS: usize = 32;
const MCP_MAX_PENDING_REQUESTS: usize = 64;
const MAX_IMPORT_TEXT_BYTES: u64 = 128 * 1024 * 1024;
const MAX_FFMPEG_STDERR_BYTES: usize = 8192;
static MCP_REQUEST_COUNTER: AtomicU64 = AtomicU64::new(1);
static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Serialize)]
struct MediaFile {
    path: String,
}

#[derive(Default)]
struct FileSystemRuntime {
    log_file: Mutex<Option<File>>,
    config_lock: Mutex<()>,
}

struct FfmpegSession {
    stdin: Mutex<Option<ChildStdin>>,
    child: Mutex<Option<Child>>,
    stderr_tail: Arc<Mutex<String>>,
    stderr_thread: Mutex<Option<thread::JoinHandle<()>>>,
    expected_rgba_frame_bytes: Option<usize>,
}

impl FfmpegSession {
    fn terminate(&self) {
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

#[derive(Default)]
struct VideoExportRuntime {
    ffmpeg_processes: Mutex<HashMap<PathBuf, Arc<FfmpegSession>>>,
    starting_ffmpeg: Mutex<HashSet<PathBuf>>,
    export_files: Mutex<HashMap<PathBuf, Arc<Mutex<File>>>>,
    render_jobs: Mutex<HashMap<String, Value>>,
}

impl VideoExportRuntime {
    fn shutdown(&self) {
        let sessions: Vec<Arc<FfmpegSession>> = if let Ok(mut guard) = self.ffmpeg_processes.lock() {
            guard.drain().map(|(_, session)| session).collect()
        } else {
            Vec::new()
        };
        for session in sessions {
            session.terminate();
        }
        if let Ok(mut guard) = self.export_files.lock() {
            guard.clear();
        }
        if let Ok(mut guard) = self.render_jobs.lock() {
            guard.clear();
        }
    }
}

#[derive(Clone)]
struct McpBridgeRuntime {
    inner: Arc<McpBridgeInner>,
}

struct McpBridgeInner {
    token: String,
    port: u16,
    descriptor_path: PathBuf,
    pending: Mutex<HashMap<String, mpsc::SyncSender<Result<Value, String>>>>,
    active_connections: Arc<AtomicUsize>,
    running: AtomicBool,
    frontend_ready: AtomicBool,
}

impl Drop for McpBridgeInner {
    fn drop(&mut self) {
        self.cleanup();
    }
}

struct McpConnectionGuard {
    counter: Arc<AtomicUsize>,
}

impl Drop for McpConnectionGuard {
    fn drop(&mut self) {
        self.counter.fetch_sub(1, Ordering::AcqRel);
    }
}

impl McpBridgeInner {
    fn drain_pending(&self) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.clear();
        }
    }

    fn cleanup(&self) {
        self.running.store(false, Ordering::Release);
        self.drain_pending();
        if let Ok(contents) = fs::read_to_string(&self.descriptor_path) {
            let is_current = serde_json::from_str::<Value>(&contents)
                .ok()
                .and_then(|descriptor| {
                    descriptor
                        .get("token")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .is_some_and(|token| constant_time_equal(&token, &self.token));
            if is_current {
                let _ = fs::remove_file(&self.descriptor_path);
            }
        }
    }
}

impl McpBridgeRuntime {
    fn start(app: AppHandle) -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .map_err(|error| format!("无法启动 MCP 本机桥: {error}"))?;
        listener
            .set_nonblocking(true)
            .map_err(|error| format!("无法配置 MCP 本机桥: {error}"))?;
        let port = listener
            .local_addr()
            .map_err(|error| format!("无法读取 MCP 本机桥地址: {error}"))?
            .port();
        let token = create_mcp_token()?;
        let descriptor_id = create_mcp_token()?;
        let descriptor_prefix = descriptor_id
            .get(..24)
            .ok_or_else(|| "无法生成 MCP 描述文件标识".to_string())?;
        let descriptor_dir = app
            .path()
            .app_config_dir()
            .map_err(|error| format!("无法获取 MCP 桥接配置目录: {error}"))?
            .join("mcp");
        fs::create_dir_all(&descriptor_dir)
            .map_err(|error| format!("无法创建 MCP 桥接配置目录: {error}"))?;
        let descriptor_path = descriptor_dir.join(format!(
            "{}{}.json",
            MCP_DESCRIPTOR_PREFIX,
            descriptor_prefix
        ));
        write_mcp_descriptor(&descriptor_path, port, &token)?;
        let sweep_dir = descriptor_dir.clone();
        let own_descriptor = descriptor_path.clone();
        let _ = thread::Builder::new()
            .name("m7-editor-mcp-sweep".to_string())
            .spawn(move || sweep_stale_mcp_descriptors(&sweep_dir, &own_descriptor));
        let bridge = Self {
            inner: Arc::new(McpBridgeInner {
                token,
                port,
                descriptor_path,
                pending: Mutex::new(HashMap::new()),
                active_connections: Arc::new(AtomicUsize::new(0)),
                running: AtomicBool::new(true),
                frontend_ready: AtomicBool::new(false),
            }),
        };
        let listener_bridge = bridge.clone();
        thread::Builder::new()
            .name("m7-editor-mcp-bridge".to_string())
            .spawn(move || {
                while listener_bridge.inner.running.load(Ordering::Acquire) {
                    match listener.accept() {
                        Ok((mut stream, _)) => {
                            let prev = listener_bridge
                                .inner
                                .active_connections
                                .fetch_add(1, Ordering::AcqRel);
                            if prev >= MCP_MAX_CONCURRENT_CONNECTIONS {
                                listener_bridge
                                    .inner
                                    .active_connections
                                    .fetch_sub(1, Ordering::AcqRel);
                                let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));
                                write_mcp_http_response(
                                    &mut stream,
                                    503,
                                    "Service Unavailable",
                                    &json!({ "error": "MCP 本机桥连接繁忙，请稍后重试" }),
                                );
                                continue;
                            }
                            let guard = McpConnectionGuard {
                                counter: Arc::clone(&listener_bridge.inner.active_connections),
                            };
                            let request_bridge = listener_bridge.clone();
                            let request_app = app.clone();
                            if thread::Builder::new()
                                .name("m7-editor-mcp-request".to_string())
                                .spawn(move || {
                                    let _guard = guard;
                                    request_bridge.serve_connection(&request_app, stream);
                                })
                                .is_err()
                            {
                                // `_guard` is dropped here if spawn failed? No, moved into closure only on success,
                                // wait: if `spawn` returns Err, the closure isn't constructed/called; Wait: in Rust
                                // the closure was moved into `spawn`, so on Err it's dropped, which drops `guard`!
                            }
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(40));
                        }
                        Err(_) => thread::sleep(Duration::from_millis(100)),
                    }
                }
            })
            .map_err(|error| format!("无法启动 MCP 本机桥线程: {error}"))?;
        Ok(bridge)
    }

    fn serve_connection(&self, app: &AppHandle, mut stream: TcpStream) {
        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
        let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
        let result = self.read_and_dispatch(app, &mut stream);
        match result {
            Ok(value) => write_mcp_http_response(&mut stream, 200, "OK", &json!({ "result": value })),
            Err((status, message)) => {
                write_mcp_http_response(&mut stream, status, "Error", &json!({ "error": message }))
            }
        }
    }

    fn read_and_dispatch(
        &self,
        app: &AppHandle,
        stream: &mut TcpStream,
    ) -> Result<Value, (u16, String)> {
        let mut buffer = Vec::with_capacity(2048);
        let mut chunk = [0u8; 2048];
        let header_end = loop {
            if let Some(pos) = find_http_header_end(&buffer) {
                break pos;
            }
            if buffer.len() >= MCP_MAX_HEADER_BYTES {
                return Err((431, "HTTP 请求头过大".to_string()));
            }
            let read = stream
                .read(&mut chunk)
                .map_err(|_| (400, "HTTP 请求头不完整".to_string()))?;
            if read == 0 {
                return Err((400, "HTTP 请求头不完整".to_string()));
            }
            buffer.extend_from_slice(&chunk[..read]);
        };
        if header_end > MCP_MAX_HEADER_BYTES {
            return Err((431, "HTTP 请求头过大".to_string()));
        }

        let headers_text = std::str::from_utf8(&buffer[..header_end])
            .map_err(|_| (400, "HTTP 请求头格式无效".to_string()))?;
        let leftover = &buffer[header_end + 4..];

        let mut lines = headers_text.split("\r\n");
        let request_line = lines.next().unwrap_or_default();
        let mut request_parts = request_line.split(' ');
        let http_method = request_parts.next().unwrap_or_default();
        let http_target = request_parts.next().unwrap_or_default();
        let http_version = request_parts.next().unwrap_or_default();
        if request_parts.next().is_some()
            || (http_version != "HTTP/1.1" && http_version != "HTTP/1.0")
        {
            return Err((400, "HTTP 请求行无效".to_string()));
        }
        if http_target != "/rpc" {
            return Err((404, "仅支持 POST /rpc".to_string()));
        }
        if http_method != "POST" {
            return Err((405, "仅支持 POST /rpc".to_string()));
        }

        let mut content_length: Option<usize> = None;
        let mut authorization: Option<String> = None;
        let mut host: Option<String> = None;
        let mut has_origin = false;
        let mut json_content_type: Option<bool> = None;
        let mut has_transfer_encoding = false;
        for line in lines {
            if line.is_empty() {
                continue;
            }
            let Some((name, value)) = line.split_once(':') else {
                return Err((400, "HTTP 请求头格式无效".to_string()));
            };
            let trimmed_value = value.trim();
            match name.trim().to_ascii_lowercase().as_str() {
                "content-length" => {
                    if content_length.is_some() {
                        return Err((400, "重复的 Content-Length 请求头".to_string()));
                    }
                    if trimmed_value.is_empty() || !trimmed_value.bytes().all(|b| b.is_ascii_digit()) {
                        return Err((400, "Content-Length 请求头无效".to_string()));
                    }
                    let parsed = trimmed_value
                        .parse::<usize>()
                        .map_err(|_| (413, "MCP 请求体超过 1 MiB".to_string()))?;
                    content_length = Some(parsed);
                }
                "authorization" => {
                    if authorization.is_some() {
                        return Err((400, "重复的 Authorization 请求头".to_string()));
                    }
                    authorization = Some(trimmed_value.to_string());
                }
                "host" => {
                    if host.is_some() {
                        return Err((400, "重复的 Host 请求头".to_string()));
                    }
                    host = Some(trimmed_value.to_ascii_lowercase());
                }
                "origin" => has_origin = true,
                "content-type" => {
                    if json_content_type.is_some() {
                        return Err((400, "重复的 Content-Type 请求头".to_string()));
                    }
                    let media_type = trimmed_value.split(';').next().unwrap_or("").trim();
                    json_content_type = Some(media_type.eq_ignore_ascii_case("application/json"));
                }
                "transfer-encoding" => has_transfer_encoding = true,
                _ => {}
            }
        }

        if has_origin {
            return Err((403, "MCP 本机桥不接受浏览器来源请求".to_string()));
        }
        let expected_host = format!("127.0.0.1:{}", self.inner.port);
        let expected_localhost = format!("localhost:{}", self.inner.port);
        if !host
            .as_deref()
            .is_some_and(|value| value == expected_host || value == expected_localhost)
        {
            return Err((403, "MCP 本机桥拒绝了非本机 Host".to_string()));
        }
        let expected_auth = format!("Bearer {}", self.inner.token);
        if !authorization
            .as_deref()
            .is_some_and(|value| constant_time_equal(value, &expected_auth))
        {
            return Err((401, "MCP 桥接令牌无效".to_string()));
        }
        if !self.inner.running.load(Ordering::Acquire) {
            return Err((503, "MCP 本机桥正在关闭".to_string()));
        }
        if !self.inner.frontend_ready.load(Ordering::Acquire) {
            return Err((503, "编辑器界面尚未连接 MCP 桥，请稍后重试".to_string()));
        }
        if json_content_type != Some(true) || has_transfer_encoding {
            return Err((400, "请求必须使用固定长度的 application/json 内容".to_string()));
        }
        let Some(content_length) = content_length else {
            return Err((411, "请求缺少 Content-Length".to_string()));
        };
        if content_length == 0 {
            return Err((400, "MCP 请求体不能为空".to_string()));
        }
        if content_length > MCP_MAX_BODY_BYTES {
            return Err((413, "MCP 请求体超过 1 MiB".to_string()));
        }
        if leftover.len() > content_length {
            return Err((400, "HTTP 请求体长度与 Content-Length 不匹配".to_string()));
        }

        let remaining = content_length - leftover.len();
        let mut body = Vec::with_capacity(leftover.len().saturating_add(remaining.min(64 * 1024)));
        body.extend_from_slice(leftover);
        if remaining > 0 {
            let mut limited = stream.take(remaining as u64);
            limited
                .read_to_end(&mut body)
                .map_err(|_| (400, "MCP 请求体不完整".to_string()))?;
            if body.len() != content_length {
                return Err((400, "MCP 请求体不完整".to_string()));
            }
        }

        let request: Value = serde_json::from_slice(&body)
            .map_err(|error| (400, format!("MCP 请求 JSON 无效: {error}")))?;
        let Some(request_obj) = request.as_object() else {
            return Err((400, "MCP 请求体必须是 JSON 对象".to_string()));
        };
        let method = request_obj
            .get("method")
            .and_then(Value::as_str)
            .filter(|method| !method.is_empty())
            .ok_or_else(|| (400, "MCP 请求缺少 method".to_string()))?;
        let params = match request_obj.get("params") {
            None | Some(Value::Null) => json!({}),
            Some(Value::Object(_)) => request_obj.get("params").cloned().unwrap_or_else(|| json!({})),
            Some(_) => return Err((400, "MCP 请求 params 必须是 JSON 对象".to_string())),
        };
        let request_id = format!(
            "mcp-{}-{}",
            now_millis(),
            MCP_REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed)
        );
        let (sender, receiver) = mpsc::sync_channel(1);
        {
            let mut pending = self
                .inner
                .pending
                .lock()
                .map_err(|_| (500, "MCP 请求队列不可用".to_string()))?;
            if pending.len() >= MCP_MAX_PENDING_REQUESTS {
                return Err((503, "MCP 请求队列已满，请稍后重试".to_string()));
            }
            pending.insert(request_id.clone(), sender);
        }
        if let Err(error) = app.emit_to(
            MAIN_WINDOW_LABEL,
            "mcp-command",
            json!({ "requestId": request_id, "method": method, "params": params }),
        ) {
            if let Ok(mut pending) = self.inner.pending.lock() {
                pending.remove(&request_id);
            }
            return Err((503, format!("编辑器窗口未连接 MCP 桥: {error}")));
        }

        let response_timeout = match method {
            "editor.captureFrame"
            | "editor.exportVideo"
            | "editor.getVideoExportStatus"
            | "editor.cancelVideoExport" => Duration::from_secs(90),
            _ => Duration::from_secs(30),
        };
        match receiver.recv_timeout(response_timeout) {
            Ok(Ok(value)) => Ok(value),
            Ok(Err(message)) => Err((422, message)),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if let Ok(mut pending) = self.inner.pending.lock() {
                    pending.remove(&request_id);
                }
                Err((
                    504,
                    format!("编辑器未在 {} 秒内响应 MCP 请求", response_timeout.as_secs()),
                ))
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                Err((503, "编辑器 MCP 请求通道已关闭".to_string()))
            }
        }
    }

    fn complete(&self, request_id: String, result: Option<Value>, error: Option<String>) -> Result<(), String> {
        let sender = self
            .inner
            .pending
            .lock()
            .map_err(|_| "MCP 请求队列不可用".to_string())?
            .remove(&request_id)
            .ok_or_else(|| "MCP 请求不存在或已超时".to_string())?;
        let response = match error {
            Some(message) => Err(message),
            None => result.ok_or_else(|| "编辑器返回了空 MCP 响应".to_string()),
        };
        sender
            .send(response)
            .map_err(|_| "MCP 客户端已断开".to_string())
    }

    fn shutdown(&self) {
        self.inner.cleanup();
    }

    fn set_frontend_ready(&self, ready: bool) {
        self.inner.frontend_ready.store(ready, Ordering::Release);
        if !ready {
            self.inner.drain_pending();
        }
    }
}

fn sweep_stale_mcp_descriptors(descriptor_dir: &Path, own_descriptor: &Path) {
    let Ok(entries) = fs::read_dir(descriptor_dir) else {
        return;
    };
    let now = SystemTime::now();
    for entry in entries.flatten() {
        let path = entry.path();
        if path == own_descriptor {
            continue;
        }
        let Some(name) = path.file_name().and_then(|v| v.to_str()) else {
            continue;
        };
        if !name.starts_with(MCP_DESCRIPTOR_PREFIX) || !name.ends_with(".json") {
            continue;
        }
        let is_old = entry
            .metadata()
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age > Duration::from_secs(10));
        let Ok(contents) = fs::read_to_string(&path) else {
            continue;
        };
        let parsed = serde_json::from_str::<Value>(&contents);
        let port = parsed
            .as_ref()
            .ok()
            .and_then(|v| v.get("port"))
            .and_then(Value::as_u64)
            .and_then(|p| u16::try_from(p).ok())
            .filter(|&p| p > 0);
        let Some(port) = port else {
            if is_old {
                let _ = fs::remove_file(&path);
            }
            continue;
        };
        let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
        if let Err(error) = TcpStream::connect_timeout(&addr, Duration::from_millis(2500)) {
            if matches!(
                error.kind(),
                std::io::ErrorKind::ConnectionRefused | std::io::ErrorKind::AddrNotAvailable
            ) {
                let _ = fs::remove_file(&path);
            }
        }
    }
}

fn find_http_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

#[tauri::command]
fn complete_mcp_request(
    bridge: State<'_, McpBridgeRuntime>,
    request_id: String,
    result: Option<Value>,
    error: Option<String>,
) -> Result<(), String> {
    bridge.complete(request_id, result, error)
}

#[tauri::command]
fn set_mcp_frontend_ready(bridge: State<'_, McpBridgeRuntime>, ready: bool) {
    bridge.set_frontend_ready(ready);
}

fn write_mcp_http_response(stream: &mut TcpStream, status: u16, reason: &str, payload: &Value) {
    let Ok(body) = serde_json::to_vec(payload) else {
        return;
    };
    let headers = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n",
        status,
        reason,
        body.len()
    );
    let _ = stream.write_all(headers.as_bytes());
    let _ = stream.write_all(&body);
}

fn constant_time_equal(left: &str, right: &str) -> bool {
    let left_bytes = left.as_bytes();
    let right_bytes = right.as_bytes();
    let max_len = left_bytes.len().max(right_bytes.len());
    let mut diff = left_bytes.len() ^ right_bytes.len();
    for i in 0..max_len {
        let l = left_bytes.get(i).copied().unwrap_or(0);
        let r = right_bytes.get(i).copied().unwrap_or(0);
        diff |= usize::from(l ^ r);
    }
    diff == 0
}

fn create_mcp_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    #[cfg(unix)]
    {
        use std::io::Read;
        fs::File::open("/dev/urandom")
            .and_then(|mut file| file.read_exact(&mut bytes))
            .map_err(|error| format!("无法生成 MCP 鉴权令牌: {error}"))?;
    }
    #[cfg(windows)]
    {
        #[link(name = "bcrypt")]
        extern "system" {
            fn BCryptGenRandom(
                algorithm: *mut std::ffi::c_void,
                buffer: *mut u8,
                buffer_length: u32,
                flags: u32,
            ) -> i32;
        }
        const BCRYPT_USE_SYSTEM_PREFERRED_RNG: u32 = 0x0000_0002;
        let status = unsafe {
            BCryptGenRandom(
                std::ptr::null_mut(),
                bytes.as_mut_ptr(),
                bytes.len() as u32,
                BCRYPT_USE_SYSTEM_PREFERRED_RNG,
            )
        };
        if status < 0 {
            return Err(format!("无法生成 MCP 鉴权令牌 (NTSTATUS {status:#x})"));
        }
    }
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn write_mcp_descriptor(path: &Path, port: u16, token: &str) -> Result<(), String> {
    let contents = serde_json::to_vec(&json!({
        "host": "127.0.0.1",
        "port": port,
        "token": token,
        "pid": std::process::id()
    }))
    .map_err(|error| format!("无法生成 MCP 桥接描述: {error}"))?;
    let mut options = OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .map_err(|error| format!("无法写入 MCP 桥接描述: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("无法保护 MCP 桥接令牌: {error}"))?;
    }
    file.write_all(&contents)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("无法保存 MCP 桥接描述: {error}"))
}

#[cfg(not(any(unix, windows)))]
fn create_mcp_token() -> Result<String, String> {
    Err("当前平台不支持安全生成 MCP 鉴权令牌".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    version: String,
    projects: Vec<String>,
    #[serde(default)]
    global_settings: GlobalSettings,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GlobalSettings {
    playhead_step_ms: f64,
    danmaku_duration: DanmakuDurationSettings,
    aggressive_optimization: bool,
    #[serde(default)]
    selected_danmaku_template_name: Option<String>,
    #[serde(default)]
    replace_default_danmaku_with_template: bool,
    #[serde(default = "default_true")]
    use_webgl_video_export: bool,
}

impl Default for GlobalSettings {
    fn default() -> Self {
        Self {
            playhead_step_ms: 16.666667,
            danmaku_duration: DanmakuDurationSettings::default(),
            aggressive_optimization: false,
            selected_danmaku_template_name: None,
            replace_default_danmaku_with_template: false,
            use_webgl_video_export: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DanmakuDurationSettings {
    mode: String,
    value: f64,
}

impl Default for DanmakuDurationSettings {
    fn default() -> Self {
        Self {
            mode: "ms".to_string(),
            value: 1000.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectMediaConfig {
    name: Option<String>,
    use_external_link: bool,
    external_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectConfig {
    version: String,
    name: String,
    created_at: i64,
    last_change_at: i64,
    last_back_up_at: Option<i64>,
    project_file: String,
    media: Option<ProjectMediaConfig>,
    description: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileSystemStateDto {
    config_path: String,
    documents_data_dir: String,
    logs_dir: String,
    default_projects_dir: String,
    projects: Vec<ProjectSummary>,
    global_settings: GlobalSettings,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSummary {
    path: String,
    config: ProjectConfig,
    project_exists: bool,
    media_path: Option<String>,
    media_exists: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectPathCheck {
    path: String,
    exists: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateFolderProjectRequest {
    parent_dir: String,
    name: String,
    from_project: Option<Value>,
    #[serde(default)]
    from_project_path: Option<String>,
    media_path: Option<String>,
    copy_media: bool,
    description: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveFolderProjectRequest {
    project_path: String,
    project: Value,
    pending_media_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateFolderProjectConfigRequest {
    project_path: String,
    config: ProjectConfig,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditFolderProjectRequest {
    project_path: String,
    name: Option<String>,
    new_parent_dir: Option<String>,
    media_use_external_link: Option<bool>,
    media_external_path: Option<String>,
    description: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderProjectPayload {
    path: String,
    config: ProjectConfig,
    project: Value,
    media_file: Option<MediaFile>,
    warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DanmakuTemplateRecord {
    name: String,
    created_at: i64,
    last_change_at: i64,
    danmakus: Vec<Value>,
}

#[cfg(desktop)]
const MAIN_WINDOW_LABEL: &str = "main";

const VIDEO_EXPORT_RENDER_WINDOW_LABEL: &str = "video-export-render";
// MCP frame captures use their own surface so they can run during video export.
const VIDEO_FRAME_RENDER_WINDOW_LABEL: &str = "video-frame-render";

#[cfg(desktop)]
const TRAY_ID: &str = "main";

#[cfg(desktop)]
const TRAY_MENU_SHOW: &str = "tray-show";

#[cfg(desktop)]
const TRAY_MENU_HIDE: &str = "tray-hide";

#[cfg(desktop)]
const TRAY_MENU_QUIT: &str = "tray-quit";

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn is_windows_reserved_name(name: &str) -> bool {
    let base = name.split('.').next().unwrap_or(name).trim();
    matches!(
        base.to_ascii_uppercase().as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

fn sanitize_file_name_core(name: &str) -> Option<String> {
    let sanitized: String = name
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            character if character.is_control() => '_',
            character => character,
        })
        .collect();

    let mut trimmed = sanitized
        .trim_matches(|c: char| c.is_whitespace() || c == '.')
        .chars()
        .take(180)
        .collect::<String>();
    trimmed = trimmed
        .trim_matches(|c: char| c.is_whitespace() || c == '.')
        .to_string();
    if trimmed.is_empty() {
        return None;
    }
    if is_windows_reserved_name(&trimmed) {
        Some(format!("_{trimmed}"))
    } else {
        Some(trimmed)
    }
}

fn sanitize_file_name(name: &str) -> String {
    sanitize_file_name_core(name).unwrap_or_else(|| "Project".to_string())
}

fn validate_single_file_name(name: &str, label: &str) -> Result<String, String> {
    if name.is_empty() || name.trim().is_empty() {
        return Err(format!("{label}文件名不能为空"));
    }
    if name.trim() != name || name.ends_with('.') {
        return Err(format!("{label}文件名无效"));
    }
    if name.contains(['/', '\\', '\0']) || name.chars().any(|c| c.is_control()) {
        return Err(format!("{label}文件名包含非法字符"));
    }
    if name == "." || name == ".." || is_windows_reserved_name(name) {
        return Err(format!("{label}文件名无效"));
    }
    let mut components = Path::new(name).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => Ok(name.to_string()),
        _ => Err(format!("{label}文件名包含非法路径段")),
    }
}

fn resolve_file_inside_dir(base_dir: &Path, file_name: &str, label: &str) -> Result<PathBuf, String> {
    validate_single_file_name(file_name, label)?;
    let canonical_base = base_dir
        .canonicalize()
        .map_err(|error| format!("无法读取{label}目录: {error}"))?;
    let candidate = canonical_base.join(file_name);
    match fs::symlink_metadata(&candidate) {
        Ok(meta) if meta.file_type().is_symlink() => {
            let canonical_target = candidate
                .canonicalize()
                .map_err(|error| format!("{label}符号链接无效: {error}"))?;
            if !canonical_target.starts_with(&canonical_base) {
                return Err(format!("{label}路径不能指向目录外部"));
            }
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("无法检查{label}路径: {error}")),
    }
    Ok(candidate)
}

fn validate_absolute_dir_input(raw: &str, label: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(format!("{label}不能为空"));
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err(format!("{label}必须是绝对路径"));
    }
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(format!("{label}不能包含 .. 路径段"));
    }
    Ok(path)
}

fn paths_refer_to_same_entry(left: &Path, right: &Path) -> bool {
    if left == right {
        return true;
    }
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

fn copy_file_safely(source: &Path, target: &Path, label: &str) -> Result<(), String> {
    let canonical_source = source
        .canonicalize()
        .map_err(|error| format!("无法读取{label}: {error}"))?;
    if !canonical_source.is_file() {
        return Err(format!("{label}不是有效文件"));
    }
    if target.exists() && paths_refer_to_same_entry(&canonical_source, target) {
        return Ok(());
    }
    let parent = target
        .parent()
        .filter(|dir| !dir.as_os_str().is_empty())
        .ok_or_else(|| format!("无法确定目标{label}目录"))?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建目标{label}目录: {error}"))?;

    let file_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("copy.tmp");
    let seq = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let temp_path = parent.join(format!(".{file_name}.{}.{seq}.tmp", std::process::id()));

    let copy_result = (|| -> Result<(), String> {
        fs::copy(&canonical_source, &temp_path)
            .map_err(|error| format!("无法复制{label}: {error}"))?;
        let file = OpenOptions::new()
            .read(true)
            .open(&temp_path)
            .map_err(|error| format!("无法校验{label}: {error}"))?;
        let _ = file.sync_all();
        Ok(())
    })();

    if let Err(error) = copy_result {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }

    if let Err(error) = fs::rename(&temp_path, target) {
        let _ = fs::remove_file(&temp_path);
        return Err(format!("无法写入目标{label}: {error}"));
    }

    Ok(())
}

fn app_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("无法获取应用配置目录: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建应用配置目录: {error}"))?;
    Ok(dir.join(APP_CONFIG_FILE))
}

fn documents_data_dirs(app: &AppHandle) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|error| format!("无法获取 Documents 目录: {error}"))?;
    let data_dir = documents.join(APP_DIR_NAME);
    let logs_dir = data_dir.join("logs");
    let projects_dir = data_dir.join("projects");
    let templates_dir = data_dir.join("templates");

    fs::create_dir_all(&logs_dir).map_err(|error| format!("无法创建日志目录: {error}"))?;
    fs::create_dir_all(&projects_dir).map_err(|error| format!("无法创建默认工程目录: {error}"))?;
    fs::create_dir_all(&templates_dir).map_err(|error| format!("无法创建模板目录: {error}"))?;

    Ok((data_dir, logs_dir, projects_dir))
}

fn default_app_config() -> AppConfig {
    AppConfig {
        version: APP_VERSION.to_string(),
        projects: Vec::new(),
        global_settings: GlobalSettings::default(),
    }
}

fn read_text_file_bounded(path: &Path, max_bytes: u64, label: &str) -> Result<String, String> {
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("无法读取{label} {}: {error}", path.display()))?;
    let meta = fs::metadata(&canonical)
        .map_err(|error| format!("无法读取{label}信息 {}: {error}", canonical.display()))?;
    if !meta.is_file() {
        return Err(format!("{label}路径不是文件: {}", canonical.display()));
    }
    if meta.len() > max_bytes {
        return Err(format!(
            "{label}过大（{} 字节），超过允许上限 {} 字节",
            meta.len(),
            max_bytes
        ));
    }
    fs::read_to_string(&canonical)
        .map_err(|error| format!("无法读取{label} {}: {error}", canonical.display()))
}

fn read_json_bounded<T>(path: &Path, max_bytes: u64) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("无法读取文件 {}: {error}", path.display()))?;
    let file = File::open(&canonical)
        .map_err(|error| format!("无法读取文件 {}: {error}", canonical.display()))?;
    let meta = file
        .metadata()
        .map_err(|error| format!("无法读取文件信息 {}: {error}", canonical.display()))?;
    if !meta.is_file() {
        return Err(format!("路径不是文件: {}", canonical.display()));
    }
    if meta.len() > max_bytes {
        return Err(format!(
            "JSON 文件过大（{} 字节），超过允许上限 {} 字节",
            meta.len(),
            max_bytes
        ));
    }
    let reader = BufReader::new(file);
    serde_json::from_reader(reader)
        .map_err(|error| format!("无法解析 JSON {}: {error}", canonical.display()))
}

fn read_json<T>(path: &Path) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    read_json_bounded(path, MAX_IMPORT_TEXT_BYTES)
}

fn write_json<T>(path: &Path, value: &T) -> Result<(), String>
where
    T: Serialize + ?Sized,
{
    let parent = path
        .parent()
        .filter(|dir| !dir.as_os_str().is_empty())
        .ok_or_else(|| format!("无法确定文件 {} 的父目录", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("无法创建目录 {}: {error}", parent.display()))?;

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("data.json");
    let seq = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let temp_path = parent.join(format!(".{file_name}.{}.{seq}.tmp", std::process::id()));

    let write_result = (|| -> Result<(), String> {
        let file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)
            .map_err(|error| format!("无法创建临时文件 {}: {error}", temp_path.display()))?;
        let mut writer = BufWriter::new(file);
        serde_json::to_writer_pretty(&mut writer, value)
            .map_err(|error| format!("无法序列化 JSON: {error}"))?;
        writer
            .flush()
            .map_err(|error| format!("无法刷新写入 {}: {error}", temp_path.display()))?;
        let file = writer
            .into_inner()
            .map_err(|error| format!("无法刷新缓冲区 {}: {error}", temp_path.display()))?;
        file.sync_all()
            .map_err(|error| format!("无法同步文件 {}: {error}", temp_path.display()))?;
        Ok(())
    })();

    if let Err(error) = write_result {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }

    if let Err(error) = fs::rename(&temp_path, path) {
        let _ = fs::remove_file(&temp_path);
        return Err(format!("无法写入文件 {}: {error}", path.display()));
    }

    Ok(())
}

fn with_app_config_lock<T>(
    app: &AppHandle,
    operation: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    if let Some(runtime) = app.try_state::<FileSystemRuntime>() {
        let _guard = runtime
            .config_lock
            .lock()
            .map_err(|_| "应用配置状态锁定失败".to_string())?;
        operation()
    } else {
        operation()
    }
}

fn load_app_config_unlocked(app: &AppHandle) -> Result<AppConfig, String> {
    let path = app_config_path(app)?;

    if !path.exists() {
        let config = default_app_config();
        write_json(&path, &config)?;
        return Ok(config);
    }

    let mut config = read_json::<AppConfig>(&path)?;
    config.projects.sort();
    config.projects.dedup();
    Ok(config)
}

fn save_app_config_unlocked(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = app_config_path(app)?;
    write_json(&path, config)
}

fn add_project_to_app_config(app: &AppHandle, project_path: &Path) -> Result<(), String> {
    let canonical = project_path
        .canonicalize()
        .map_err(|error| format!("无法读取工程路径: {error}"))?;
    let path_text = canonical.to_string_lossy().into_owned();
    with_app_config_lock(app, || {
        let mut config = load_app_config_unlocked(app)?;
        if !config.projects.iter().any(|path| path == &path_text) {
            config.projects.push(path_text);
            config.projects.sort();
            save_app_config_unlocked(app, &config)?;
        }
        Ok(())
    })
}

fn remove_project_from_app_config(app: &AppHandle, project_path: &Path) -> Result<(), String> {
    let candidate = project_path.to_string_lossy().into_owned();
    let canonical = project_path
        .canonicalize()
        .ok()
        .map(|path| path.to_string_lossy().into_owned());
    with_app_config_lock(app, || {
        let mut config = load_app_config_unlocked(app)?;
        config.projects.retain(|path| {
            path != &candidate
                && canonical
                    .as_ref()
                    .is_none_or(|canonical_path| path != canonical_path)
        });
        save_app_config_unlocked(app, &config)
    })
}

fn replace_project_in_app_config(
    app: &AppHandle,
    old_project_path: &Path,
    new_project_path: &Path,
) -> Result<(), String> {
    let old_candidate = old_project_path.to_string_lossy().into_owned();
    let old_canonical = old_project_path
        .canonicalize()
        .ok()
        .map(|path| path.to_string_lossy().into_owned());
    let new_canonical = new_project_path
        .canonicalize()
        .map_err(|error| format!("无法读取工程路径: {error}"))?;
    let new_text = new_canonical.to_string_lossy().into_owned();
    with_app_config_lock(app, || {
        let mut config = load_app_config_unlocked(app)?;
        config.projects.retain(|path| {
            path != &old_candidate
                && old_canonical
                    .as_ref()
                    .is_none_or(|canonical_path| path != canonical_path)
        });
        if !config.projects.iter().any(|path| path == &new_text) {
            config.projects.push(new_text);
        }
        config.projects.sort();
        config.projects.dedup();
        save_app_config_unlocked(app, &config)
    })
}

fn validate_project_config_fields(config: &ProjectConfig) -> Result<(), String> {
    validate_single_file_name(&config.project_file, "工程文件")?;
    if let Some(media) = config.media.as_ref() {
        if !media.use_external_link {
            if let Some(name) = media.name.as_deref().filter(|value| !value.is_empty()) {
                validate_single_file_name(name, "工程媒体文件")?;
            }
        }
    }
    Ok(())
}

fn load_project_config(project_dir: &Path) -> Result<ProjectConfig, String> {
    let config: ProjectConfig = read_json(&project_dir.join(PROJECT_CONFIG_FILE))?;
    validate_project_config_fields(&config)?;
    Ok(config)
}

fn save_project_config(project_dir: &Path, config: &ProjectConfig) -> Result<(), String> {
    validate_project_config_fields(config)?;
    write_json(&project_dir.join(PROJECT_CONFIG_FILE), config)
}

fn resolve_project_media_path(project_dir: &Path, config: &ProjectConfig) -> Option<PathBuf> {
    let media = config.media.as_ref()?;

    if media.use_external_link {
        return media
            .external_path
            .as_ref()
            .filter(|path| !path.trim().is_empty())
            .map(PathBuf::from);
    }

    let name = media.name.as_deref().filter(|name| !name.is_empty())?;
    let media_dir = project_dir.join("media");
    if media_dir.is_dir() {
        resolve_file_inside_dir(&media_dir, name, "媒体").ok()
    } else {
        validate_single_file_name(name, "媒体")
            .ok()
            .map(|safe_name| media_dir.join(safe_name))
    }
}

fn media_config_from_path(
    project_dir: &Path,
    project_name: &str,
    path: &Path,
    copy_media: bool,
) -> Result<(Option<ProjectMediaConfig>, Option<PathBuf>), String> {
    if path.as_os_str().is_empty() {
        return Ok((None, None));
    }

    let canonical = canonical_media_file(path)?;

    if !copy_media {
        let file_name = canonical
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| project_name.to_string());
        return Ok((
            Some(ProjectMediaConfig {
                name: Some(file_name),
                use_external_link: true,
                external_path: Some(canonical.to_string_lossy().into_owned()),
            }),
            Some(canonical),
        ));
    }

    let extension = canonical
        .extension()
        .map(|extension| format!(".{}", extension.to_string_lossy()))
        .unwrap_or_default();
    let media_file_name = format!("{}{}", sanitize_file_name(project_name), extension);
    let media_dir = project_dir.join("media");
    fs::create_dir_all(&media_dir).map_err(|error| format!("无法创建媒体目录: {error}"))?;
    let target = resolve_file_inside_dir(&media_dir, &media_file_name, "媒体")?;
    copy_file_safely(&canonical, &target, "媒体文件")?;

    Ok((
        Some(ProjectMediaConfig {
            name: Some(media_file_name),
            use_external_link: false,
            external_path: None,
        }),
        Some(target),
    ))
}

fn set_project_media_value(project: &mut Value, media_path: Option<&Path>) {
    if !project.is_object() {
        *project = json!({});
    }

    if let Some(object) = project.as_object_mut() {
        let path_text = media_path
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default();

        object.insert(
            "media".to_string(),
            json!({
                "path": path_text,
                "url": path_text,
            }),
        );
    }
}

fn build_folder_project_payload(
    app: &AppHandle,
    canonical_dir: &Path,
    config: ProjectConfig,
    mut project: Value,
) -> Result<FolderProjectPayload, String> {
    let resolved_media = resolve_project_media_path(canonical_dir, &config);
    let media_path = resolved_media.as_ref().filter(|path| path.is_file());
    set_project_media_value(&mut project, media_path.map(|p| p.as_path()));

    let mut warnings: Vec<String> = Vec::new();
    if config.media.is_some() {
        match &resolved_media {
            Some(expected_path) if !expected_path.is_file() => {
                warnings.push(format!("媒体文件不存在：{}", expected_path.display()));
            }
            None => {
                warnings.push("工程配置了媒体文件但无法解析其路径".to_string());
            }
            _ => {}
        }
    }

    let media_file = match media_path {
        Some(path) => Some(register_media_path(app, path.clone())?),
        None => None,
    };

    Ok(FolderProjectPayload {
        path: canonical_dir.to_string_lossy().into_owned(),
        config,
        project,
        media_file,
        warnings,
    })
}

fn load_folder_project_payload(
    app: &AppHandle,
    project_dir: &Path,
) -> Result<FolderProjectPayload, String> {
    let canonical_dir = project_dir
        .canonicalize()
        .map_err(|error| format!("无法读取工程文件夹: {error}"))?;
    if !canonical_dir.is_dir() {
        return Err("工程路径不是有效文件夹".to_string());
    }
    let config = load_project_config(&canonical_dir)?;
    let project_file = resolve_file_inside_dir(&canonical_dir, &config.project_file, "工程文件")?;
    let project = read_validated_project_json(&project_file)?;
    build_folder_project_payload(app, &canonical_dir, config, project)
}

fn project_summary(project_path: &Path) -> Result<ProjectSummary, String> {
    let canonical = project_path
        .canonicalize()
        .map_err(|error| format!("无法读取工程路径: {error}"))?;
    if !canonical.is_dir() {
        return Err("工程路径不是有效文件夹".to_string());
    }
    let config = load_project_config(&canonical)?;
    let project_exists = resolve_file_inside_dir(&canonical, &config.project_file, "工程文件")
        .map(|path| path.is_file())
        .unwrap_or(false);
    let media_path = resolve_project_media_path(&canonical, &config);
    let media_exists = media_path.as_ref().is_some_and(|path| path.is_file());

    Ok(ProjectSummary {
        path: canonical.to_string_lossy().into_owned(),
        config,
        project_exists,
        media_path: media_path.map(|path| path.to_string_lossy().into_owned()),
        media_exists,
    })
}

fn save_folder_project_inner(
    app: &AppHandle,
    project_path: &Path,
    mut project: Value,
    pending_media_path: Option<String>,
) -> Result<FolderProjectPayload, String> {
    validate_project_json_value(&project, "保存的工程数据")?;
    let project_dir = project_path
        .canonicalize()
        .map_err(|error| format!("无法读取工程路径: {error}"))?;
    if !project_dir.is_dir() {
        return Err("工程路径不是有效文件夹".to_string());
    }
    let mut config = load_project_config(&project_dir)?;
    let mut media_path =
        resolve_project_media_path(&project_dir, &config).filter(|path| path.is_file());
    let mut old_internal_to_remove: Option<PathBuf> = None;

    if let Some(raw_path) = pending_media_path.filter(|path| !path.trim().is_empty()) {
        let next_media = canonical_media_file(raw_path.trim())?;
        let use_external_link = config
            .media
            .as_ref()
            .map(|media| media.use_external_link)
            .unwrap_or(false);

        if use_external_link {
            let file_name = next_media
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| config.name.clone());
            config.media = Some(ProjectMediaConfig {
                name: Some(file_name),
                use_external_link: true,
                external_path: Some(next_media.to_string_lossy().into_owned()),
            });
            media_path = Some(next_media);
        } else {
            let old_internal_media = config
                .media
                .as_ref()
                .filter(|media| !media.use_external_link)
                .and_then(|_| resolve_project_media_path(&project_dir, &config));
            let extension = next_media
                .extension()
                .map(|extension| format!(".{}", extension.to_string_lossy()))
                .unwrap_or_default();
            let media_file_name = format!("{}{}", sanitize_file_name(&config.name), extension);
            let media_dir = project_dir.join("media");
            fs::create_dir_all(&media_dir).map_err(|error| format!("无法创建媒体目录: {error}"))?;
            let target = resolve_file_inside_dir(&media_dir, &media_file_name, "媒体")?;

            copy_file_safely(&next_media, &target, "媒体文件")?;
            if let Some(old_path) = old_internal_media {
                if !paths_refer_to_same_entry(&old_path, &target) && old_path.is_file() {
                    old_internal_to_remove = Some(old_path);
                }
            }

            config.media = Some(ProjectMediaConfig {
                name: Some(media_file_name),
                use_external_link: false,
                external_path: None,
            });
            media_path = Some(target);
        }
    }

    config.last_change_at = now_millis();
    set_project_media_value(&mut project, media_path.as_deref());
    let project_file = resolve_file_inside_dir(&project_dir, &config.project_file, "工程文件")?;
    write_json(&project_file, &project)?;
    save_project_config(&project_dir, &config)?;
    if let Some(old_path) = old_internal_to_remove {
        let _ = fs::remove_file(old_path);
    }
    add_project_to_app_config(app, &project_dir)?;

    build_folder_project_payload(app, &project_dir, config, project)
}

fn backup_timestamp(timestamp: i64) -> String {
    let seconds = timestamp / 1000;
    let millis = (timestamp % 1000).abs();
    format!("{seconds}_{millis:03}")
}

fn canonical_media_file(path: impl AsRef<Path>) -> Result<PathBuf, String> {
    let path = path.as_ref();
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("无法读取媒体文件路径: {error}"))?;

    if !canonical.is_file() {
        return Err("选择的路径不是文件".to_string());
    }

    Ok(canonical)
}

fn initialize_file_system(app: &AppHandle) -> Result<File, String> {
    let (_data_dir, logs_dir, _projects_dir) = documents_data_dirs(app)?;
    let _ = load_app_config_unlocked(app)?;
    let log_path = logs_dir.join(format!("m7-editor_{}.log", backup_timestamp(now_millis())));
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| format!("无法创建日志文件: {error}"))?;
    writeln!(file, "m7-editor {APP_VERSION} log started")
        .map_err(|error| format!("无法写入日志文件: {error}"))?;

    Ok(file)
}

#[tauri::command]
async fn get_file_system_state(app: AppHandle) -> Result<FileSystemStateDto, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config_path = app_config_path(&app)?;
        let (documents_data_dir, logs_dir, default_projects_dir) = documents_data_dirs(&app)?;
        let mut config = with_app_config_lock(&app, || {
            let mut config = load_app_config_unlocked(&app)?;
            let mut normalized_projects: Vec<String> = Vec::with_capacity(config.projects.len());
            let mut changed = false;

            for path_text in &config.projects {
                let path = Path::new(path_text);
                if let Ok(canonical) = path.canonicalize() {
                    if canonical.is_dir() && canonical.join(PROJECT_CONFIG_FILE).is_file() {
                        let canonical_text = canonical.to_string_lossy().into_owned();
                        if &canonical_text != path_text {
                            changed = true;
                        }
                        if !normalized_projects.contains(&canonical_text) {
                            normalized_projects.push(canonical_text);
                        } else {
                            changed = true;
                        }
                        continue;
                    }
                }
                changed = true;
            }

            if changed {
                normalized_projects.sort();
                config.projects = normalized_projects;
                save_app_config_unlocked(&app, &config)?;
            }
            Ok(config)
        })?;

        let projects = config
            .projects
            .drain(..)
            .filter_map(|path| project_summary(Path::new(&path)).ok())
            .collect();

        Ok(FileSystemStateDto {
            config_path: config_path.to_string_lossy().into_owned(),
            documents_data_dir: documents_data_dir.to_string_lossy().into_owned(),
            logs_dir: logs_dir.to_string_lossy().into_owned(),
            default_projects_dir: default_projects_dir.to_string_lossy().into_owned(),
            projects,
            global_settings: config.global_settings,
        })
    })
    .await
    .map_err(|error| format!("读取文件系统状态失败: {error}"))?
}

#[tauri::command]
async fn update_global_settings(app: AppHandle, settings: GlobalSettings) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_app_config_lock(&app, || {
            let mut config = load_app_config_unlocked(&app)?;
            config.global_settings = settings;
            save_app_config_unlocked(&app, &config)
        })
    })
    .await
    .map_err(|error| format!("保存全局设置失败: {error}"))?
}

fn template_file_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let Some(sanitized) = sanitize_file_name_core(name) else {
        return Err("模板名称不能为空或仅包含无效字符".to_string());
    };
    let (data_dir, _, _) = documents_data_dirs(app)?;
    let templates_dir = data_dir.join("templates");
    resolve_file_inside_dir(&templates_dir, &format!("{sanitized}.json"), "模板")
}

#[tauri::command]
async fn list_danmaku_templates(app: AppHandle) -> Result<Vec<DanmakuTemplateRecord>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (data_dir, _, _) = documents_data_dirs(&app)?;
        let templates_dir = data_dir.join("templates");
        let mut entries = fs::read_dir(&templates_dir)
            .map_err(|error| format!("无法读取模板目录: {error}"))?
            .filter_map(Result::ok)
            .filter(|entry| {
                entry.file_type().is_ok_and(|ft| ft.is_file())
                    && entry
                        .path()
                        .extension()
                        .is_some_and(|extension| extension == "json")
            })
            .collect::<Vec<_>>();
        entries.sort_by_key(|entry| entry.file_name());

        entries
            .into_iter()
            .map(|entry| {
                let name = entry
                    .path()
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .ok_or_else(|| "模板文件名无效".to_string())?
                    .to_string();
                let value = read_json::<Value>(&entry.path())?;
                let danmakus = value
                    .get("danmakus")
                    .and_then(Value::as_array)
                    .cloned()
                    .ok_or_else(|| format!("模板 {name} 缺少有效的 danmakus 数组"))?;
                Ok(DanmakuTemplateRecord {
                    name,
                    created_at: value.get("createdAt").and_then(Value::as_i64).unwrap_or(0),
                    last_change_at: value
                        .get("lastChangeAt")
                        .and_then(Value::as_i64)
                        .unwrap_or(0),
                    danmakus,
                })
            })
            .collect()
    })
    .await
    .map_err(|error| format!("读取模板列表失败: {error}"))?
}

#[tauri::command]
async fn create_danmaku_template(
    app: AppHandle,
    name: String,
    danmakus: Vec<Value>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = template_file_path(&app, &name)?;
        if path.exists() {
            return Err("同名模板已存在".to_string());
        }
        let now = now_millis();
        write_json(
            &path,
            &json!({
                "version": APP_VERSION,
                "createdAt": now,
                "lastChangeAt": now,
                "danmakus": danmakus
            }),
        )
    })
    .await
    .map_err(|error| format!("创建模板失败: {error}"))?
}

#[tauri::command]
async fn update_danmaku_template(
    app: AppHandle,
    name: String,
    danmakus: Vec<Value>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = template_file_path(&app, &name)?;
        let mut value = read_json::<Value>(&path)?;
        let object = value
            .as_object_mut()
            .ok_or_else(|| "模板文件内容必须是 JSON 对象".to_string())?;
        object.insert("danmakus".to_string(), Value::Array(danmakus));
        object.insert("lastChangeAt".to_string(), json!(now_millis()));
        write_json(&path, &value)
    })
    .await
    .map_err(|error| format!("更新模板失败: {error}"))?
}

#[tauri::command]
async fn rename_danmaku_template(
    app: AppHandle,
    name: String,
    new_name: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let old_path = template_file_path(&app, &name)?;
        let new_path = template_file_path(&app, &new_name)?;
        if !old_path.is_file() {
            return Err("模板不存在".to_string());
        }
        if old_path != new_path && new_path.exists() && !paths_refer_to_same_entry(&old_path, &new_path) {
            return Err("同名模板已存在".to_string());
        }
        fs::rename(old_path, new_path).map_err(|error| format!("无法重命名模板: {error}"))
    })
    .await
    .map_err(|error| format!("重命名模板失败: {error}"))?
}

#[tauri::command]
async fn delete_danmaku_template(app: AppHandle, name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = template_file_path(&app, &name)?;
        if !path.is_file() {
            return Err("模板不存在".to_string());
        }
        move_path_to_recycle_bin(&path)
    })
    .await
    .map_err(|error| format!("删除模板失败: {error}"))?
}

#[tauri::command]
fn check_folder_project_path(parent_dir: String, name: String) -> Result<ProjectPathCheck, String> {
    if name.trim().is_empty() {
        return Err("工程名称不能为空".to_string());
    }
    let parent_path = validate_absolute_dir_input(&parent_dir, "工程父目录")?;
    let project_name = sanitize_file_name(&name);
    let path = parent_path.join(project_name);

    Ok(ProjectPathCheck {
        exists: path.exists(),
        path: path.to_string_lossy().into_owned(),
    })
}

fn validate_project_json_value(project: &Value, label: &str) -> Result<(), String> {
    if !project.is_object() {
        return Err(format!("{label}格式无效（根节点必须是对象）"));
    }
    if let Some(danmakus) = project.get("danmakus") {
        if !danmakus.is_array() {
            return Err(format!("{label}格式无效（danmakus 必须是数组）"));
        }
    }
    Ok(())
}

fn read_validated_project_json(path: &Path) -> Result<Value, String> {
    let project = read_json::<Value>(path)
        .map_err(|error| format!("无法读取工程文件 {}: {error}", path.display()))?;
    validate_project_json_value(&project, &format!("工程文件 {}", path.display()))?;
    Ok(project)
}

#[tauri::command]
async fn create_folder_project(
    app: AppHandle,
    request: CreateFolderProjectRequest,
) -> Result<FolderProjectPayload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let trimmed_name = request.name.trim();
        if trimmed_name.is_empty() {
            return Err("工程名称不能为空".to_string());
        }

        let from_project_path = request
            .from_project_path
            .as_deref()
            .map(str::trim)
            .filter(|path| !path.is_empty());
        if request.from_project.is_some() && from_project_path.is_some() {
            return Err("不能同时指定 fromProject 和 fromProjectPath".to_string());
        }

        let source_project = match (request.from_project, from_project_path) {
            (Some(project), None) => {
                validate_project_json_value(&project, "fromProject")?;
                Some(project)
            }
            (None, Some(path)) => Some(read_validated_project_json(Path::new(path))?),
            (None, None) => None,
            (Some(_), Some(_)) => unreachable!(),
        };

        let project_name = sanitize_file_name(trimmed_name);
        let parent_dir = validate_absolute_dir_input(&request.parent_dir, "工程父目录")?;
        fs::create_dir_all(&parent_dir).map_err(|error| format!("无法创建工程父目录: {error}"))?;

        let project_dir = parent_dir.join(&project_name);
        if project_dir.exists() {
            return Err(format!("工程目录已存在: {}", project_dir.display()));
        }

        fs::create_dir_all(project_dir.join("backup"))
            .map_err(|error| format!("无法创建备份目录: {error}"))?;
        let init_result = (|| -> Result<FolderProjectPayload, String> {
            fs::create_dir_all(project_dir.join("media"))
                .map_err(|error| format!("无法创建媒体目录: {error}"))?;

            let created_at = now_millis();
            let project_file = format!("{project_name}.json");
            let (media, media_path) = match request.media_path.filter(|path| !path.trim().is_empty()) {
                Some(path) => media_config_from_path(
                    &project_dir,
                    &project_name,
                    Path::new(path.trim()),
                    request.copy_media,
                )?,
                None => (None, None),
            };

            let config = ProjectConfig {
                version: APP_VERSION.to_string(),
                name: project_name.clone(),
                created_at,
                last_change_at: created_at,
                last_back_up_at: None,
                project_file: project_file.clone(),
                media,
                description: request.description.unwrap_or_default(),
            };

            let mut project = source_project.unwrap_or_else(|| {
                json!({
                    "meta": {
                        "version": APP_VERSION,
                        "createdAt": created_at
                    },
                    "timeline": {},
                    "media": {},
                    "player": {
                        "screenWidth": 800,
                        "screenHeight": 450,
                        "maxLayers": 100
                    },
                    "preprocess": {},
                    "danmakus": []
                })
            });
            set_project_media_value(&mut project, media_path.as_deref());

            let canonical_dir = project_dir
                .canonicalize()
                .map_err(|error| format!("无法读取新工程文件夹: {error}"))?;
            save_project_config(&canonical_dir, &config)?;
            let project_file_path = resolve_file_inside_dir(&canonical_dir, &project_file, "工程文件")?;
            write_json(&project_file_path, &project)?;
            add_project_to_app_config(&app, &canonical_dir)?;

            build_folder_project_payload(&app, &canonical_dir, config, project)
        })();

        if let Err(error) = init_result {
            let _ = fs::remove_dir_all(&project_dir);
            return Err(error);
        }
        init_result
    })
    .await
    .map_err(|error| format!("创建文件夹工程失败: {error}"))?
}

#[tauri::command]
async fn load_folder_project(
    app: AppHandle,
    project_path: String,
) -> Result<FolderProjectPayload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        load_folder_project_payload(&app, Path::new(&project_path))
    })
    .await
    .map_err(|error| format!("加载文件夹工程失败: {error}"))?
}

#[tauri::command]
async fn save_folder_project(
    app: AppHandle,
    request: SaveFolderProjectRequest,
) -> Result<FolderProjectPayload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        save_folder_project_inner(
            &app,
            Path::new(&request.project_path),
            request.project,
            request.pending_media_path,
        )
    })
    .await
    .map_err(|error| format!("保存文件夹工程失败: {error}"))?
}

#[tauri::command]
async fn backup_folder_project(
    app: AppHandle,
    request: SaveFolderProjectRequest,
) -> Result<FolderProjectPayload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut payload = save_folder_project_inner(
            &app,
            Path::new(&request.project_path),
            request.project,
            request.pending_media_path,
        )?;
        let project_dir = PathBuf::from(&payload.path);
        let backup_dir = project_dir.join("backup");
        fs::create_dir_all(&backup_dir).map_err(|error| format!("无法创建备份目录: {error}"))?;

        let backed_up_at = now_millis();
        let safe_stem = sanitize_file_name(&payload.config.name);
        let stamp = backup_timestamp(backed_up_at);
        let mut backup_name = format!("{safe_stem}_backup_{stamp}.json");
        let mut backup_target = resolve_file_inside_dir(&backup_dir, &backup_name, "备份文件")?;
        if backup_target.exists() {
            let seq = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
            backup_name = format!("{safe_stem}_backup_{stamp}_{seq}.json");
            backup_target = resolve_file_inside_dir(&backup_dir, &backup_name, "备份文件")?;
        }
        let source_project_file =
            resolve_file_inside_dir(&project_dir, &payload.config.project_file, "工程文件")?;
        copy_file_safely(&source_project_file, &backup_target, "工程备份")?;

        payload.config.last_back_up_at = Some(backed_up_at);
        payload.config.last_change_at = backed_up_at;
        save_project_config(&project_dir, &payload.config)?;
        Ok(payload)
    })
    .await
    .map_err(|error| format!("备份文件夹工程失败: {error}"))?
}

#[tauri::command]
async fn update_folder_project_config(
    app: AppHandle,
    request: UpdateFolderProjectConfigRequest,
) -> Result<ProjectSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let project_dir = PathBuf::from(request.project_path)
            .canonicalize()
            .map_err(|error| format!("无法读取工程路径: {error}"))?;
        if !project_dir.is_dir() || !project_dir.join(PROJECT_CONFIG_FILE).is_file() {
            return Err("目标路径不是有效的文件夹工程".to_string());
        }
        let mut config = request.config;
        validate_project_config_fields(&config)?;
        config.last_change_at = now_millis();
        save_project_config(&project_dir, &config)?;
        add_project_to_app_config(&app, &project_dir)?;
        project_summary(&project_dir)
    })
    .await
    .map_err(|error| format!("更新工程配置失败: {error}"))?
}

#[tauri::command]
async fn edit_folder_project(
    app: AppHandle,
    request: EditFolderProjectRequest,
) -> Result<ProjectSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let project_dir = PathBuf::from(&request.project_path)
            .canonicalize()
            .map_err(|error| format!("无法读取工程路径: {error}"))?;
        if !project_dir.is_dir() {
            return Err("工程路径不是有效文件夹".to_string());
        }
        let mut config = load_project_config(&project_dir)?;
        let old_project_file = config.project_file.clone();

        let mut target_dir_name = project_dir
            .file_name()
            .ok_or("无法获取工程文件夹名")?
            .to_os_string();
        let mut new_project_file = old_project_file.clone();

        // 计算重命名后的目录名和工程文件名（先计算校验，不修改磁盘）
        if let Some(ref new_name) = request.name {
            if new_name.trim().is_empty() {
                return Err("工程名称不能为空".to_string());
            }
            let sanitized = sanitize_file_name(new_name);
            if sanitized != config.name {
                let extension = Path::new(&config.project_file)
                    .extension()
                    .map(|ext| format!(".{}", ext.to_string_lossy()))
                    .unwrap_or_else(|| ".json".to_string());
                new_project_file = format!("{sanitized}{extension}");
                config.name = sanitized.clone();
                config.project_file = new_project_file.clone();
                target_dir_name = std::ffi::OsString::from(&sanitized);
            }
        }

        // 计算移动后的父目录
        let current_parent = project_dir
            .parent()
            .map(|p| fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf()))
            .ok_or("无法获取工程父目录")?;
        let mut target_parent = current_parent.clone();
        if let Some(ref new_parent) = request.new_parent_dir {
            let trimmed_parent = new_parent.trim();
            if !trimmed_parent.is_empty() {
                let parent = validate_absolute_dir_input(trimmed_parent, "目标父目录")?;
                fs::create_dir_all(&parent)
                    .map_err(|error| format!("无法创建目标父目录: {error}"))?;
                target_parent = fs::canonicalize(&parent).unwrap_or(parent);
            }
        }

        let target_project_dir = target_parent.join(&target_dir_name);
        let dir_changed = target_project_dir != project_dir;
        if dir_changed
            && target_project_dir.exists()
            && !paths_refer_to_same_entry(&target_project_dir, &project_dir)
        {
            return Err(format!("目标目录已存在: {}", target_project_dir.display()));
        }

        // 检查工程文件重命名冲突（仍在原目录上校验，避免目录移动后才失败）
        let file_rename_needed = new_project_file != old_project_file;
        if file_rename_needed {
            let old_file_path = resolve_file_inside_dir(&project_dir, &old_project_file, "旧工程文件")?;
            let new_file_path = resolve_file_inside_dir(&project_dir, &new_project_file, "新工程文件")?;
            if old_file_path.is_file()
                && new_file_path.exists()
                && !paths_refer_to_same_entry(&old_file_path, &new_file_path)
            {
                return Err(format!("目标工程文件已存在: {}", new_file_path.display()));
            }
        }

        // 准备媒体变更（先校验并拷贝，成功提交后再删除旧内部文件）
        enum PendingMediaOp {
            None,
            DeleteOldInternal(PathBuf),
            CopyToInternal {
                source: PathBuf,
                target_name: String,
                old_internal: Option<PathBuf>,
            },
        }
        let mut media_op = PendingMediaOp::None;

        if request.media_use_external_link.is_some() || request.media_external_path.is_some() {
            let use_external = request.media_use_external_link.unwrap_or_else(|| {
                config
                    .media
                    .as_ref()
                    .map(|m| m.use_external_link)
                    .unwrap_or(false)
            });

            if use_external {
                let ext_path = request
                    .media_external_path
                    .clone()
                    .unwrap_or_else(|| {
                        config
                            .media
                            .as_ref()
                            .and_then(|m| m.external_path.clone())
                            .unwrap_or_default()
                    })
                    .trim()
                    .to_string();

                let old_internal = config
                    .media
                    .as_ref()
                    .filter(|m| !m.use_external_link)
                    .and_then(|_| resolve_project_media_path(&project_dir, &config))
                    .filter(|p| p.is_file());

                if ext_path.is_empty() {
                    config.media = None;
                } else {
                    let canonical_ext = canonical_media_file(&ext_path)?;
                    let file_name = canonical_ext
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_else(|| config.name.clone());
                    config.media = Some(ProjectMediaConfig {
                        name: Some(file_name),
                        use_external_link: true,
                        external_path: Some(canonical_ext.to_string_lossy().into_owned()),
                    });
                }
                if let Some(old_path) = old_internal {
                    media_op = PendingMediaOp::DeleteOldInternal(old_path);
                }
            } else {
                let explicit_source = request
                    .media_external_path
                    .as_deref()
                    .map(str::trim)
                    .filter(|p| !p.is_empty())
                    .map(str::to_string);
                let existing_internal = config
                    .media
                    .as_ref()
                    .filter(|m| !m.use_external_link)
                    .and_then(|_| resolve_project_media_path(&project_dir, &config));
                let source_path = explicit_source.or_else(|| {
                    config.media.as_ref().and_then(|m| {
                        if m.use_external_link {
                            m.external_path.clone()
                        } else {
                            existing_internal
                                .as_ref()
                                .map(|p| p.to_string_lossy().into_owned())
                        }
                    })
                });

                match source_path.filter(|p| !p.trim().is_empty()) {
                    None => {
                        config.media = None;
                    }
                    Some(raw_source) => {
                        let canonical_source = canonical_media_file(raw_source.trim())?;
                        let extension = canonical_source
                            .extension()
                            .map(|ext| format!(".{}", ext.to_string_lossy()))
                            .unwrap_or_default();
                        let media_file_name =
                            format!("{}{}", sanitize_file_name(&config.name), extension);
                        media_op = PendingMediaOp::CopyToInternal {
                            source: canonical_source,
                            target_name: media_file_name.clone(),
                            old_internal: existing_internal,
                        };
                        config.media = Some(ProjectMediaConfig {
                            name: Some(media_file_name),
                            use_external_link: false,
                            external_path: None,
                        });
                    }
                }
            }
        }

        if let Some(ref desc) = request.description {
            config.description = desc.clone();
        }
        config.last_change_at = now_millis();
        validate_project_config_fields(&config)?;

        // 1. 先执行目录移动/重命名（若失败，磁盘上没有任何部分变更）
        let active_dir = if dir_changed {
            fs::rename(&project_dir, &target_project_dir).map_err(|error| {
                format!("无法移动/重命名工程目录（若工程中的媒体正在播放，请先停止或切换工程）: {error}")
            })?;
            target_project_dir
        } else {
            project_dir.clone()
        };

        // 2. 在最终目录中重命名工程 JSON 文件，若失败则回滚目录移动
        if file_rename_needed {
            let old_file = resolve_file_inside_dir(&active_dir, &old_project_file, "工程文件")?;
            let new_file = resolve_file_inside_dir(&active_dir, &new_project_file, "工程文件")?;
            if old_file.is_file() {
                if let Err(error) = fs::rename(&old_file, &new_file) {
                    if dir_changed {
                        let _ = fs::rename(&active_dir, &project_dir);
                    }
                    return Err(format!("无法重命名工程文件: {error}"));
                }
            }
        }

        // 3. 如有内部媒体复制操作，先安全复制到新目录后再保存配置
        let mut deferred_delete: Option<PathBuf> = None;
        match media_op {
            PendingMediaOp::None => {}
            PendingMediaOp::DeleteOldInternal(old_path) => {
                if let Some(name) = old_path.file_name() {
                    let relocated = active_dir.join("media").join(name);
                    if relocated.is_file() {
                        deferred_delete = Some(relocated);
                    }
                }
            }
            PendingMediaOp::CopyToInternal {
                source,
                target_name,
                old_internal,
            } => {
                let media_dir = active_dir.join("media");
                fs::create_dir_all(&media_dir)
                    .map_err(|error| format!("无法创建媒体目录: {error}"))?;
                let target = resolve_file_inside_dir(&media_dir, &target_name, "媒体")?;
                let actual_source = if let Some(ref old_path) = old_internal {
                    if paths_refer_to_same_entry(&source, old_path) {
                        old_path
                            .file_name()
                            .map(|n| media_dir.join(n))
                            .unwrap_or_else(|| source.clone())
                    } else {
                        source.clone()
                    }
                } else {
                    source.clone()
                };
                copy_file_safely(&actual_source, &target, "媒体文件")?;
                if let Some(old_path) = old_internal {
                    if let Some(name) = old_path.file_name() {
                        let relocated_old = media_dir.join(name);
                        if !paths_refer_to_same_entry(&relocated_old, &target)
                            && relocated_old.is_file()
                        {
                            deferred_delete = Some(relocated_old);
                        }
                    }
                }
            }
        }

        // 4. 原子保存工程配置和全局工程注册表，最后清理旧媒体副本
        save_project_config(&active_dir, &config)?;
        if let Some(old_path) = deferred_delete {
            let _ = fs::remove_file(old_path);
        }
        if dir_changed {
            replace_project_in_app_config(&app, &project_dir, &active_dir)?;
        } else {
            add_project_to_app_config(&app, &active_dir)?;
        }
        project_summary(&active_dir)
    })
    .await
    .map_err(|error| format!("编辑工程失败: {error}"))?
}

#[tauri::command]
async fn remove_folder_project(app: AppHandle, project_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let trimmed = project_path.trim();
        if trimmed.is_empty() {
            return Err("工程路径不能为空".to_string());
        }
        let project_dir = PathBuf::from(trimmed);
        if project_dir.exists() {
            if !project_dir.is_dir() || !project_dir.join(PROJECT_CONFIG_FILE).is_file() {
                return Err("目标路径不是有效的文件夹工程（缺少 project_config.json），已拒绝删除".to_string());
            }
            move_path_to_recycle_bin(&project_dir)?;
        }
        remove_project_from_app_config(&app, &project_dir)
    })
    .await
    .map_err(|error| format!("删除文件夹工程失败: {error}"))?
}

#[tauri::command]
fn append_log(runtime: tauri::State<FileSystemRuntime>, line: String) -> Result<(), String> {
    let mut guard = runtime
        .log_file
        .lock()
        .map_err(|_| "日志状态锁定失败".to_string())?;
    let Some(file) = guard.as_mut() else {
        return Ok(());
    };

    let mut buffer = Vec::with_capacity(line.len() + 1);
    buffer.extend_from_slice(line.as_bytes());
    buffer.push(b'\n');
    file.write_all(&buffer)
        .map_err(|error| format!("无法写入日志文件: {error}"))
}

fn register_media_path(app: &AppHandle, path: PathBuf) -> Result<MediaFile, String> {
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|error| format!("无法授权媒体文件读取: {error}"))?;

    Ok(MediaFile {
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn register_media_file(app: AppHandle, path: String) -> Result<MediaFile, String> {
    let path = canonical_media_file(path)?;
    register_media_path(&app, path)
}

#[cfg(desktop)]
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.show();
        if window.is_minimized().unwrap_or(false) {
            let _ = window.unminimize();
        }
        let _ = window.set_focus();
    }
}

#[cfg(desktop)]
fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.hide();
    }
}

#[cfg(desktop)]
fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_main_window(app);
        }
    }
}

#[cfg(windows)]
fn run_windows_sta_dialog<T: Send + 'static>(
    operation: impl FnOnce() -> Result<Option<T>, String> + Send + 'static,
) -> Result<Option<T>, String> {
    let handle = thread::Builder::new()
        .name("m7-win-dialog".to_string())
        .spawn(operation)
        .map_err(|error| format!("无法启动系统对话框线程: {error}"))?;
    match handle.join() {
        Ok(result) => result,
        Err(_) => Err("系统对话框线程意外中止".to_string()),
    }
}

#[cfg(windows)]
struct WinComGuard;

#[cfg(windows)]
impl Drop for WinComGuard {
    fn drop(&mut self) {
        unsafe {
            windows::Win32::System::Com::CoUninitialize();
        }
    }
}

#[cfg(windows)]
struct WinCoTaskMemGuard(*mut std::ffi::c_void);

#[cfg(windows)]
impl Drop for WinCoTaskMemGuard {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                windows::Win32::System::Com::CoTaskMemFree(Some(self.0));
            }
        }
    }
}

#[cfg(windows)]
unsafe fn read_win_shell_item_path(
    item: &windows::Win32::UI::Shell::IShellItem,
) -> Result<PathBuf, String> {
    use windows::Win32::UI::Shell::SIGDN_FILESYSPATH;

    let display_name = item
        .GetDisplayName(SIGDN_FILESYSPATH)
        .map_err(|error| format!("读取文件路径失败: {error}"))?;
    let _guard = WinCoTaskMemGuard(display_name.0.cast());
    if display_name.0.is_null() {
        return Err("系统对话框返回了空路径".to_string());
    }
    let path = display_name
        .to_string()
        .map_err(|error| format!("转换文件路径失败: {error}"))?;
    if path.trim().is_empty() {
        return Err("系统对话框返回了空路径".to_string());
    }
    Ok(PathBuf::from(path))
}

#[cfg(windows)]
fn open_windows_file_dialog(
    title: &'static str,
    filters: &'static [(&'static str, &'static str)],
    pick_folders: bool,
) -> Result<Option<PathBuf>, String> {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{FileOpenDialog, IFileOpenDialog, FOS_PICKFOLDERS};

    const HRESULT_FROM_WIN32_ERROR_CANCELLED: i32 = -2147023673;

    run_windows_sta_dialog(move || unsafe {
        let init_hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        if !init_hr.is_ok() {
            return Err(format!("初始化系统选择器失败: {init_hr:?}"));
        }
        let _com = WinComGuard;

        let dialog: IFileOpenDialog =
            CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
                .map_err(|error| format!("创建系统选择器失败: {error}"))?;

        if pick_folders {
            dialog
                .SetOptions(FOS_PICKFOLDERS)
                .map_err(|error| format!("设置文件夹选择器失败: {error}"))?;
        }
        let title_h = HSTRING::from(title);
        dialog
            .SetTitle(&title_h)
            .map_err(|error| format!("设置选择器标题失败: {error}"))?;
        if !filters.is_empty() {
            let owned_filters: Vec<(HSTRING, HSTRING)> = filters
                .iter()
                .map(|(name, spec)| (HSTRING::from(*name), HSTRING::from(*spec)))
                .collect();
            let filter_specs: Vec<COMDLG_FILTERSPEC> = owned_filters
                .iter()
                .map(|(name, spec)| COMDLG_FILTERSPEC {
                    pszName: PCWSTR(name.as_ptr()),
                    pszSpec: PCWSTR(spec.as_ptr()),
                })
                .collect();
            dialog
                .SetFileTypes(&filter_specs)
                .map_err(|error| format!("设置文件筛选器失败: {error}"))?;
        }

        if let Err(error) = dialog.Show(None) {
            if error.code().0 == HRESULT_FROM_WIN32_ERROR_CANCELLED {
                return Ok(None);
            }
            return Err(format!("打开系统选择器失败: {error}"));
        }

        let item = dialog
            .GetResult()
            .map_err(|error| format!("读取选择结果失败: {error}"))?;
        read_win_shell_item_path(&item).map(Some)
    })
}

#[cfg(windows)]
fn open_media_file_dialog() -> Result<Option<PathBuf>, String> {
    open_windows_file_dialog(
        "选择媒体文件",
        &[
            (
                "媒体文件",
                "*.mp4;*.mov;*.mkv;*.avi;*.webm;*.flv;*.wmv;*.mp3;*.wav;*.flac;*.aac;*.m4a;*.ogg",
            ),
            ("所有文件", "*.*"),
        ],
        false,
    )
}

#[cfg(target_os = "macos")]
fn open_macos_panel(
    title_str: &str,
    choose_files: bool,
    choose_dirs: bool,
    extensions: &[&str],
) -> Result<Option<PathBuf>, String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSModalResponseOK, NSOpenPanel};
    use objc2_foundation::{NSArray, NSString};

    let Some(mtm) = MainThreadMarker::new() else {
        return Err("macOS 选择器必须在主线程调用".to_string());
    };

    let panel = NSOpenPanel::openPanel(mtm);
    panel.setCanChooseFiles(choose_files);
    panel.setCanChooseDirectories(choose_dirs);
    panel.setAllowsMultipleSelection(false);

    let title = NSString::from_str(title_str);
    panel.setTitle(Some(&title));

    if !extensions.is_empty() {
        let ns_exts: Vec<_> = extensions.iter().map(|ext| NSString::from_str(ext)).collect();
        let refs: Vec<&NSString> = ns_exts.iter().map(|extension| &**extension).collect();
        let allowed_types = NSArray::from_slice(&refs);
        #[allow(deprecated)]
        panel.setAllowedFileTypes(Some(&allowed_types));
    }

    if panel.runModal() == NSModalResponseOK {
        let urls = panel.URLs();
        if urls.count() > 0 {
            let url = urls.objectAtIndex(0);
            if let Some(path_str) = url.path() {
                return Ok(Some(PathBuf::from(path_str.to_string())));
            }
        }
    }

    Ok(None)
}

#[cfg(target_os = "macos")]
fn open_media_file_dialog() -> Result<Option<PathBuf>, String> {
    open_macos_panel(
        "选择媒体文件",
        true,
        false,
        &[
            "mp4", "mov", "mkv", "avi", "webm", "flv", "wmv", "mp3", "wav", "flac", "aac", "m4a",
            "ogg",
        ],
    )
}

#[cfg(not(any(windows, target_os = "macos")))]
fn open_media_file_dialog() -> Result<Option<PathBuf>, String> {
    Err("当前平台暂未实现后端媒体文件选择器".to_string())
}

async fn run_platform_dialog(
    app: &AppHandle,
    dialog_fn: impl FnOnce() -> Result<Option<PathBuf>, String> + Send + 'static,
    label: &str,
) -> Result<Option<PathBuf>, String> {
    #[cfg(target_os = "macos")]
    {
        let (sender, receiver) = mpsc::sync_channel(1);
        app.run_on_main_thread(move || {
            let _ = sender.send(dialog_fn());
        })
        .map_err(|error| format!("调度 macOS {label}失败: {error}"))?;

        let dialog_result: Result<Option<PathBuf>, String> =
            tauri::async_runtime::spawn_blocking(move || {
                receiver.recv_timeout(Duration::from_secs(300))
            })
            .await
            .map_err(|error| format!("等待 macOS {label}失败: {error}"))?
            .map_err(|error| format!("等待 macOS {label}超时或失败: {error}"))?;
        dialog_result
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        tauri::async_runtime::spawn_blocking(dialog_fn)
            .await
            .map_err(|error| format!("等待{label}失败: {error}"))?
    }
}

#[tauri::command]
async fn open_media_file(app: AppHandle) -> Result<Option<MediaFile>, String> {
    let Some(path) = run_platform_dialog(&app, open_media_file_dialog, "媒体文件选择器").await?
    else {
        return Ok(None);
    };

    let path = canonical_media_file(path)?;
    register_media_path(&app, path).map(Some)
}

#[cfg(windows)]
fn open_project_folder_dialog() -> Result<Option<PathBuf>, String> {
    open_windows_file_dialog("选择工程文件夹", &[], true)
}

#[cfg(target_os = "macos")]
fn open_project_folder_dialog() -> Result<Option<PathBuf>, String> {
    open_macos_panel("选择工程文件夹", false, true, &[])
}

#[cfg(not(any(windows, target_os = "macos")))]
fn open_project_folder_dialog() -> Result<Option<PathBuf>, String> {
    Err("当前平台暂未实现后端文件夹选择器".to_string())
}

#[tauri::command]
async fn choose_project_folder(app: AppHandle) -> Result<Option<String>, String> {
    Ok(
        run_platform_dialog(&app, open_project_folder_dialog, "文件夹选择器")
            .await?
            .map(|path| path.to_string_lossy().into_owned()),
    )
}

#[tauri::command]
async fn import_folder_project(
    app: AppHandle,
    project_path: Option<String>,
) -> Result<Option<FolderProjectPayload>, String> {
    let path = match project_path {
        Some(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return Err("工程路径不能为空".to_string());
            }
            PathBuf::from(trimmed)
        }
        None => match run_platform_dialog(&app, open_project_folder_dialog, "文件夹选择器").await?
        {
            Some(selected) => selected,
            None => return Ok(None),
        },
    };

    tauri::async_runtime::spawn_blocking(move || {
        let payload = load_folder_project_payload(&app, &path)?;
        add_project_to_app_config(&app, Path::new(&payload.path))?;
        Ok(Some(payload))
    })
    .await
    .map_err(|error| format!("导入文件夹工程失败: {error}"))?
}

#[cfg(windows)]
fn open_project_file_dialog() -> Result<Option<PathBuf>, String> {
    open_windows_file_dialog(
        "选择工程文件",
        &[("m7-editor 工程文件", "*.json"), ("所有文件", "*.*")],
        false,
    )
}

#[cfg(target_os = "macos")]
fn open_project_file_dialog() -> Result<Option<PathBuf>, String> {
    open_macos_panel("选择工程文件", true, false, &["json"])
}

#[cfg(not(any(windows, target_os = "macos")))]
fn open_project_file_dialog() -> Result<Option<PathBuf>, String> {
    Err("当前平台暂未实现后端工程文件选择器".to_string())
}

#[tauri::command]
async fn open_project_file(app: AppHandle) -> Result<Option<Value>, String> {
    let Some(path) =
        run_platform_dialog(&app, open_project_file_dialog, "工程文件选择器").await?
    else {
        return Ok(None);
    };

    tauri::async_runtime::spawn_blocking(move || read_validated_project_json(&path).map(Some))
        .await
        .map_err(|error| format!("读取工程文件失败: {error}"))?
}

#[tauri::command]
async fn read_project_json_file(path: String) -> Result<Value, String> {
    let trimmed = path.trim().to_string();
    if trimmed.is_empty() {
        return Err("工程文件路径不能为空".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || read_validated_project_json(Path::new(&trimmed)))
        .await
        .map_err(|error| format!("读取工程文件失败: {error}"))?
}

#[tauri::command]
async fn read_xml_file(path: String) -> Result<String, String> {
    let trimmed = path.trim().to_string();
    if trimmed.is_empty() {
        return Err("XML 文件路径不能为空".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        read_text_file_bounded(Path::new(&trimmed), MAX_IMPORT_TEXT_BYTES, "XML 文件")
    })
    .await
    .map_err(|error| format!("读取 XML 文件失败: {error}"))?
}

#[cfg(windows)]
fn move_path_to_recycle_bin(path: &std::path::Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::Shell::{
        SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, FO_DELETE,
        SHFILEOPSTRUCTW,
    };

    let abs_path = std::fs::canonicalize(path).map_err(|e| format!("路径无效: {e}"))?;

    let path_str = abs_path.to_string_lossy();
    let clean_path = if let Some(unc) = path_str.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        path_str
            .strip_prefix(r"\\?\")
            .unwrap_or(&path_str)
            .to_string()
    };

    let mut from: Vec<u16> = std::ffi::OsStr::new(&clean_path)
        .encode_wide()
        .chain([0, 0])
        .collect();

    let mut operation = SHFILEOPSTRUCTW {
        wFunc: FO_DELETE,
        pFrom: windows::core::PCWSTR(from.as_mut_ptr()),
        fFlags: (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT).0 as u16,
        ..Default::default()
    };

    let result = unsafe { SHFileOperationW(&mut operation) };

    if result != 0 || operation.fAnyOperationsAborted.as_bool() {
        return Err(format!("删除失败，错误码: {result}"));
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn move_path_to_recycle_bin(path: &Path) -> Result<(), String> {
    use std::process::Command;

    let abs_path = std::fs::canonicalize(path).map_err(|error| format!("路径无效: {error}"))?;
    let path_str = abs_path.to_string_lossy().into_owned();
    let escaped_path = path_str.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(r#"tell application "Finder" to delete POSIX file "{}""#, escaped_path);

    let output = Command::new("/usr/bin/osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|error| format!("调用 macOS 回收站失败: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let detail = String::from_utf8_lossy(&output.stderr);
    let detail = detail.trim();
    let detail = if detail.is_empty() {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    } else {
        detail.to_string()
    };

    Err(format!(
        "移动到废纸篓失败: {}",
        if detail.is_empty() { "未知错误" } else { &detail }
    ))
}

#[cfg(not(any(windows, target_os = "macos")))]
fn move_path_to_recycle_bin(path: &Path) -> Result<(), String> {
    let result = if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };
    result.map_err(|error| format!("删除失败: {error}"))
}

#[cfg(windows)]
fn ask_close_behavior() -> i32 {
    use windows::core::w;
    use windows::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, MB_ICONQUESTION, MB_SETFOREGROUND, MB_TOPMOST, MB_YESNOCANCEL,
    };

    unsafe {
        MessageBoxW(
            None,
            w!("　　是否最小化到系统托盘？\n\n　　　　　　是：隐藏到托盘\n　　　　　　否：关闭应用\n　　　　　　取消：返回编辑器"),
            w!("关闭 m7-editor"),
            MB_YESNOCANCEL | MB_ICONQUESTION | MB_TOPMOST | MB_SETFOREGROUND,
        )
        .0
    }
}

#[cfg(not(windows))]
fn ask_close_behavior() -> i32 {
    6
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

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
async fn create_video_export_render_window(
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
    if width < 16 || width > 7680 || height < 16 || height > 4320 || width % 2 != 0 || height % 2 != 0 {
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
    let window = WebviewWindowBuilder::new(
        &app,
        window_label,
        WebviewUrl::App(url.into()),
    )
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
fn get_video_export_render_job(
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
async fn finish_video_export_render_window(
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

#[tauri::command]
async fn capture_webview_snapshot(window: WebviewWindow) -> Result<Response, String> {
    #[cfg(windows)]
    {
        use webview2_com::{
            CapturePreviewCompletedHandler,
            Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
        };
        use windows::Win32::{
            Foundation::HGLOBAL,
            System::Com::StructuredStorage::CreateStreamOnHGlobal,
        };

        let (sender, receiver) = mpsc::sync_channel::<Result<Vec<u8>, String>>(1);
        let callback_sender = sender.clone();
        let error_sender = sender.clone();

        window
            .with_webview(move |platform_webview| {
                let start_result = (|| -> Result<(), String> { unsafe {
                    let core_webview = platform_webview
                        .controller()
                        .CoreWebView2()
                        .map_err(|error| format!("读取 WebView2 实例失败: {error}"))?;
                    let stream = CreateStreamOnHGlobal(HGLOBAL::default(), true)
                        .map_err(|error| format!("创建截图缓冲区失败: {error}"))?;
                    let callback_stream = stream.clone();
                    let handler = CapturePreviewCompletedHandler::create(Box::new(move |status| {
                        let result = status
                            .map_err(|error| format!("WebView2 截图失败: {error}"))
                            .and_then(|_| stream_to_bytes(&callback_stream));
                        let _ = callback_sender.send(result);
                        Ok(())
                    }));

                    core_webview
                        .CapturePreview(
                            COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
                            &stream,
                            &handler,
                        )
                        .map_err(|error| format!("启动 WebView2 截图失败: {error}"))
                } })();

                if let Err(error) = start_result {
                    let _ = error_sender.send(Err(error));
                }
            })
            .map_err(|error| format!("调度 WebView 截图失败: {error}"))?;

        let bytes = await_webview_snapshot(receiver).await?;
        return Ok(Response::new(bytes));
    }

    #[cfg(target_os = "macos")]
    {
        use block2::RcBlock;
        use objc2::rc::Retained;
        use objc2_app_kit::NSImage;
        use objc2_foundation::NSError;
        use objc2_web_kit::WKWebView;
        use std::ptr::NonNull;

        let (sender, receiver) = mpsc::sync_channel::<Result<Vec<u8>, String>>(1);
        let callback_sender = sender.clone();
        let error_sender = sender.clone();
        window
            .with_webview(move |platform_webview| {
                let Some(webview_pointer) = NonNull::new(platform_webview.inner().cast::<WKWebView>()) else {
                    let _ = error_sender.send(Err("WKWebView 实例不可用".to_string()));
                    return;
                };
                let Some(webview) = (unsafe { Retained::retain(webview_pointer.as_ptr()) }) else {
                    let _ = error_sender.send(Err("无法保留 WKWebView 实例".to_string()));
                    return;
                };
                let callback = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
                    let result = if !error.is_null() {
                        let desc = unsafe { (*error).localizedDescription().to_string() };
                        Err(format!("WKWebView 快照失败: {desc}"))
                    } else if image.is_null() {
                        Err("WKWebView 返回了空快照".to_string())
                    } else {
                        unsafe { ns_image_to_png(&*image) }
                    };
                    let _ = callback_sender.send(result);
                });
                unsafe {
                    webview.takeSnapshotWithConfiguration_completionHandler(None, &callback);
                }
            })
            .map_err(|error| format!("调度 WKWebView 快照失败: {error}"))?;

        let bytes = await_webview_snapshot(receiver).await?;
        return Ok(Response::new(bytes));
    }

    #[cfg(target_os = "linux")]
    {
        use glib::object::ObjectType;

        let (sender, receiver) = mpsc::sync_channel::<Result<Vec<u8>, String>>(1);
        let callback_sender = sender;

        window
            .with_webview(move |platform_webview| {
                let webview = platform_webview.inner();
                let webview_pointer = webview.as_ptr().cast::<std::ffi::c_void>();
                if webview_pointer.is_null() {
                    let _ = callback_sender.send(Err("WebKitGTK 实例不可用".to_string()));
                    return;
                }
                let sender_pointer =
                    Box::into_raw(Box::new(callback_sender)).cast::<std::ffi::c_void>();
                unsafe {
                    webkit_web_view_get_snapshot(
                        webview_pointer,
                        0,
                        0,
                        std::ptr::null_mut(),
                        Some(linux_snapshot_finished),
                        sender_pointer,
                    );
                }
            })
            .map_err(|error| format!("调度 WebKitGTK 快照失败: {error}"))?;

        let bytes = await_webview_snapshot(receiver).await?;
        return Ok(Response::new(bytes));
    }

    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        let _ = window;
        Err("当前平台尚未实现 WebView 合成截图适配器".to_string())
    }
}

async fn await_webview_snapshot(
    receiver: mpsc::Receiver<Result<Vec<u8>, String>>,
) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        receiver.recv_timeout(Duration::from_secs(20))
    })
    .await
    .map_err(|error| format!("等待 WebView 截图失败: {error}"))?
    .map_err(|error| format!("等待 WebView 截图超时或失败: {error}"))?
}

#[cfg(target_os = "macos")]
unsafe fn ns_image_to_png(image: &objc2_app_kit::NSImage) -> Result<Vec<u8>, String> {
    use std::ptr::NonNull;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep};
    use objc2_foundation::NSDictionary;

    let tiff = image
        .TIFFRepresentation()
        .ok_or_else(|| "无法从 WKWebView 快照获取图像数据".to_string())?;
    let representation = NSBitmapImageRep::imageRepWithData(&tiff)
        .ok_or_else(|| "无法解码 WKWebView 快照".to_string())?;
    let properties = NSDictionary::new();
    let png = representation
        .representationUsingType_properties(NSBitmapImageFileType::PNG, &properties)
        .ok_or_else(|| "无法将 WKWebView 快照编码为 PNG".to_string())?;
    let length = png.length();
    if length == 0 {
        return Err("WKWebView 返回了空 PNG 数据".to_string());
    }
    let mut bytes = vec![0_u8; length];
    let buffer = NonNull::new(bytes.as_mut_ptr().cast())
        .ok_or_else(|| "无法分配 WKWebView 快照缓冲区".to_string())?;
    png.getBytes_length(buffer, length);
    Ok(bytes)
}

#[cfg(target_os = "linux")]
#[link(name = "webkit2gtk-4.1")]
unsafe extern "C" {
    fn webkit_web_view_get_snapshot(
        webview: *mut std::ffi::c_void,
        region: i32,
        options: u32,
        cancellable: *mut std::ffi::c_void,
        callback: Option<unsafe extern "C" fn(*mut std::ffi::c_void, *mut std::ffi::c_void, *mut std::ffi::c_void)>,
        user_data: *mut std::ffi::c_void,
    );
    fn webkit_web_view_get_snapshot_finish(
        webview: *mut std::ffi::c_void,
        result: *mut std::ffi::c_void,
        error: *mut *mut std::ffi::c_void,
    ) -> *mut std::ffi::c_void;
}

#[cfg(target_os = "linux")]
#[link(name = "cairo")]
unsafe extern "C" {
    fn cairo_surface_write_to_png_stream(
        surface: *mut std::ffi::c_void,
        write_func: Option<unsafe extern "C" fn(*mut std::ffi::c_void, *const u8, u32) -> i32>,
        closure: *mut std::ffi::c_void,
    ) -> i32;
    fn cairo_surface_destroy(surface: *mut std::ffi::c_void);
}

#[cfg(target_os = "linux")]
#[link(name = "glib-2.0")]
unsafe extern "C" {
    fn g_error_free(error: *mut std::ffi::c_void);
}

#[cfg(target_os = "linux")]
unsafe extern "C" fn linux_snapshot_finished(
    webview: *mut std::ffi::c_void,
    async_result: *mut std::ffi::c_void,
    user_data: *mut std::ffi::c_void,
) {
    let sender = Box::from_raw(user_data.cast::<mpsc::SyncSender<Result<Vec<u8>, String>>>());
    let mut error = std::ptr::null_mut();
    let surface = webkit_web_view_get_snapshot_finish(webview, async_result, &mut error);
    if surface.is_null() {
        if !error.is_null() {
            g_error_free(error);
        }
        let _ = sender.send(Err("WebKitGTK 快照失败".to_string()));
        return;
    }

    let mut png = Vec::<u8>::new();
    let status = cairo_surface_write_to_png_stream(
        surface,
        Some(write_cairo_png_bytes),
        (&mut png as *mut Vec<u8>).cast(),
    );
    cairo_surface_destroy(surface);
    if status != 0 {
        let _ = sender.send(Err(format!("Cairo PNG 编码失败，状态码 {status}")));
    } else if png.is_empty() {
        let _ = sender.send(Err("WebKitGTK 返回了空 PNG 数据".to_string()));
    } else {
        let _ = sender.send(Ok(png));
    }
}

#[cfg(target_os = "linux")]
unsafe extern "C" fn write_cairo_png_bytes(
    closure: *mut std::ffi::c_void,
    data: *const u8,
    length: u32,
) -> i32 {
    if length > 0 {
        if data.is_null() {
            return 11; // CAIRO_STATUS_WRITE_ERROR
        }
        let buffer = &mut *closure.cast::<Vec<u8>>();
        buffer.extend_from_slice(std::slice::from_raw_parts(data, length as usize));
    }
    0
}

#[cfg(windows)]
unsafe fn stream_to_bytes(
    stream: &windows::Win32::System::Com::IStream,
) -> Result<Vec<u8>, String> {
    use windows::Win32::System::Com::{STATFLAG_NONAME, STATSTG};
    use windows::Win32::System::Com::StructuredStorage::GetHGlobalFromStream;
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};

    let mut stat = STATSTG::default();
    stream
        .Stat(&mut stat, STATFLAG_NONAME)
        .map_err(|error| format!("读取截图流大小失败: {error}"))?;
    let stream_size = usize::try_from(stat.cbSize)
        .map_err(|_| "WebView2 截图大小超出内存限制".to_string())?;
    if stream_size == 0 {
        return Err("WebView2 返回了空截图".to_string());
    }

    let memory = GetHGlobalFromStream(stream)
        .map_err(|error| format!("读取截图缓冲区失败: {error}"))?;
    let alloc_size = GlobalSize(memory);
    if alloc_size == 0 || stream_size > alloc_size {
        return Err("WebView2 截图缓冲区大小无效".to_string());
    }

    let pointer = GlobalLock(memory);
    if pointer.is_null() {
        return Err("锁定截图缓冲区失败".to_string());
    }

    let bytes = std::slice::from_raw_parts(pointer.cast::<u8>(), stream_size).to_vec();
    let _ = GlobalUnlock(memory);
    Ok(bytes)
}

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

#[cfg(windows)]
fn save_video_file_dialog(default_file_name: &str) -> Result<Option<PathBuf>, String> {
    use windows::core::{w, HSTRING};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{FileSaveDialog, IFileSaveDialog};

    const HRESULT_FROM_WIN32_ERROR_CANCELLED: i32 = -2147023673;
    let default_name_owned = default_file_name.to_string();

    run_windows_sta_dialog(move || unsafe {
        let init_hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        if !init_hr.is_ok() {
            return Err(format!("初始化视频保存对话框失败: {init_hr:?}"));
        }
        let _com = WinComGuard;

        let dialog: IFileSaveDialog =
            CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER)
                .map_err(|error| format!("创建视频保存对话框失败: {error}"))?;
        let filters = [COMDLG_FILTERSPEC {
            pszName: w!("MP4 视频"),
            pszSpec: w!("*.mp4"),
        }];
        let default_name = HSTRING::from(&default_name_owned);
        dialog
            .SetTitle(w!("导出视频"))
            .map_err(|error| format!("设置保存对话框标题失败: {error}"))?;
        dialog
            .SetFileTypes(&filters)
            .map_err(|error| format!("设置 MP4 文件筛选器失败: {error}"))?;
        dialog
            .SetDefaultExtension(w!("mp4"))
            .map_err(|error| format!("设置 MP4 扩展名失败: {error}"))?;
        dialog
            .SetFileName(&default_name)
            .map_err(|error| format!("设置默认文件名失败: {error}"))?;

        if let Err(error) = dialog.Show(None) {
            if error.code().0 == HRESULT_FROM_WIN32_ERROR_CANCELLED {
                return Ok(None);
            }
            return Err(format!("打开视频保存对话框失败: {error}"));
        }

        let item = dialog
            .GetResult()
            .map_err(|error| format!("读取视频保存路径失败: {error}"))?;
        read_win_shell_item_path(&item).map(Some)
    })
}

#[cfg(target_os = "macos")]
fn save_video_file_dialog(default_file_name: &str) -> Result<Option<PathBuf>, String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSModalResponseOK, NSSavePanel};
    use objc2_foundation::NSString;

    let Some(mtm) = MainThreadMarker::new() else {
        return Err("macOS 视频保存对话框必须在主线程调用".to_string());
    };

    let panel = NSSavePanel::savePanel(mtm);
    let title = NSString::from_str("导出视频");
    panel.setTitle(Some(&title));
    let filename = NSString::from_str(default_file_name);
    panel.setNameFieldStringValue(&filename);

    if panel.runModal() == NSModalResponseOK {
        if let Some(url) = panel.URL() {
            if let Some(path) = url.path() {
                return Ok(Some(PathBuf::from(path.to_string())));
            }
        }
    }

    Ok(None)
}

#[cfg(not(any(windows, target_os = "macos")))]
fn save_video_file_dialog(default_file_name: &str) -> Result<Option<PathBuf>, String> {
    let zenity_filename = format!("--filename={default_file_name}");
    let zenity = Command::new("zenity")
        .args([
            "--file-selection",
            "--save",
            "--confirm-overwrite",
            "--title=导出视频",
            &zenity_filename,
            "--file-filter=MP4 视频 | *.mp4",
        ])
        .output();

    match zenity {
        Ok(output) if output.status.success() => {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return Ok((!path.is_empty()).then(|| PathBuf::from(path)));
        }
        Ok(_) => return Ok(None),
        Err(_) => {}
    }

    let kdialog = Command::new("kdialog")
        .args(["--getsavefilename", default_file_name, "*.mp4|MP4 视频"])
        .output()
        .map_err(|error| format!("未找到 zenity/kdialog 文件对话框: {error}"))?;

    if !kdialog.status.success() {
        return Ok(None);
    }
    let path = String::from_utf8_lossy(&kdialog.stdout).trim().to_string();
    Ok((!path.is_empty()).then(|| PathBuf::from(path)))
}

#[tauri::command]
async fn choose_video_export_path(
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

fn validate_video_export_path(path: &str) -> Result<PathBuf, String> {
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

fn normalized_export_key(path: &Path) -> PathBuf {
    if let (Some(parent), Some(file_name)) = (path.parent(), path.file_name()) {
        if let Ok(canonical_parent) = parent.canonicalize() {
            return canonical_parent.join(file_name);
        }
    }
    path.to_path_buf()
}

fn prepare_video_export_path_inner(path: &str) -> Result<PathBuf, String> {
    let path = validate_video_export_path(path)?;
    if path.is_dir() {
        return Err(format!("视频导出路径不能是目录: {}", path.display()));
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|error| {
                format!("无法创建导出目录 {}: {error}", parent.display())
            })?;
        }
    }
    Ok(path)
}

#[tauri::command]
fn prepare_video_export_path(path: String) -> Result<String, String> {
    let prepared = prepare_video_export_path_inner(&path)?;
    Ok(prepared.to_string_lossy().to_string())
}

fn decode_hex_utf8(hex: &str) -> Result<String, String> {
    if hex.len() > 32768 {
        return Err("十六进制编码路径过长".to_string());
    }
    if hex.len() % 2 != 0 {
        return Err("无效的十六进制编码长度".to_string());
    }
    let mut bytes = Vec::with_capacity(hex.len() / 2);
    for pair in hex.as_bytes().chunks_exact(2) {
        let hi = (pair[0] as char)
            .to_digit(16)
            .ok_or_else(|| "无效的十六进制字符".to_string())?;
        let lo = (pair[1] as char)
            .to_digit(16)
            .ok_or_else(|| "无效的十六进制字符".to_string())?;
        bytes.push(((hi << 4) | lo) as u8);
    }
    String::from_utf8(bytes).map_err(|_| "UTF-8 路径解码失败".to_string())
}

fn header_str<'a>(request: &'a Request<'_>, name: &str) -> Result<&'a str, String> {
    request
        .headers()
        .get(name)
        .ok_or_else(|| format!("缺少请求头 {name}"))?
        .to_str()
        .map_err(|_| format!("请求头 {name} 格式无效"))
}

fn parse_json_byte_array(value: &Value, label: &str) -> Result<Vec<u8>, String> {
    let array = value
        .as_array()
        .ok_or_else(|| format!("缺少{label}"))?;
    let mut bytes = Vec::with_capacity(array.len());
    for item in array {
        let Some(num) = item.as_u64() else {
            return Err(format!("{label}包含无效字节值"));
        };
        let byte = u8::try_from(num).map_err(|_| format!("{label}字节值超出 0..=255 范围"))?;
        bytes.push(byte);
    }
    Ok(bytes)
}

#[tauri::command]
async fn start_video_export_file(app: AppHandle, path: String) -> Result<(), String> {
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
fn write_video_export_chunk(
    runtime: State<'_, VideoExportRuntime>,
    request: Request<'_>,
) -> Result<(), String> {
    let (path_str, position, owned_json_data): (String, u64, Option<Vec<u8>>) = match request.body() {
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
async fn finish_video_export_file(
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

fn cancel_video_export_file_inner(runtime: &VideoExportRuntime, path: String) -> Result<(), String> {
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
async fn cancel_video_export_file(app: AppHandle, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = app.state::<VideoExportRuntime>();
        cancel_video_export_file_inner(&runtime, path)
    })
    .await
    .map_err(|error| format!("取消导出文件失败: {error}"))?
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
async fn can_use_ffmpeg_video_encoder(app: AppHandle) -> bool {
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
async fn start_ffmpeg_video_export(
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
        let stderr_thread = stderr.map(|mut pipe| {
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
        }).flatten();

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
fn write_ffmpeg_video_frame(
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
async fn finish_ffmpeg_video_export(app: AppHandle, output_path: String) -> Result<(), String> {
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
async fn cancel_ffmpeg_video_export(app: AppHandle, output_path: String) -> Result<(), String> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    unsafe {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--force-color-profile=srgb --disable-features=UseSkiaRenderer --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding"
        );
    }

    let mut builder = tauri::Builder::default()
        .setup(|app| {
            let log_file = initialize_file_system(app.handle())?;
            app.manage(FileSystemRuntime {
                log_file: Mutex::new(Some(log_file)),
                config_lock: Mutex::new(()),
            });
            app.manage(VideoExportRuntime::default());
            let mcp_bridge = McpBridgeRuntime::start(app.handle().clone()).map_err(|error| {
                std::io::Error::new(std::io::ErrorKind::Other, error)
            })?;
            app.manage(mcp_bridge);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            create_video_export_render_window,
            get_video_export_render_job,
            finish_video_export_render_window,
            capture_webview_snapshot,
            choose_video_export_path,
            prepare_video_export_path,
            start_video_export_file,
            write_video_export_chunk,
            finish_video_export_file,
            cancel_video_export_file,
            can_use_ffmpeg_video_encoder,
            start_ffmpeg_video_export,
            write_ffmpeg_video_frame,
            finish_ffmpeg_video_export,
            cancel_ffmpeg_video_export,
            register_media_file,
            open_media_file,
            get_file_system_state,
            update_global_settings,
            list_danmaku_templates,
            create_danmaku_template,
            update_danmaku_template,
            rename_danmaku_template,
            delete_danmaku_template,
            check_folder_project_path,
            create_folder_project,
            load_folder_project,
            save_folder_project,
            backup_folder_project,
            update_folder_project_config,
            edit_folder_project,
            remove_folder_project,
            choose_project_folder,
            import_folder_project,
            open_project_file,
            read_project_json_file,
            read_xml_file,
            append_log,
            complete_mcp_request,
            set_mcp_frontend_ready
        ]);

    #[cfg(desktop)]
    {
        builder = builder
            .on_window_event(|window, event| {
                if window.label() != MAIN_WINDOW_LABEL {
                    return;
                }

                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    match ask_close_behavior() {
                        6 => {
                            let _ = window.hide();
                        }
                        7 => window.app_handle().exit(0),
                        _ => {}
                    }
                }
            })
            .on_menu_event(|app, event| match event.id().as_ref() {
                TRAY_MENU_SHOW => show_main_window(app),
                TRAY_MENU_HIDE => hide_main_window(app),
                TRAY_MENU_QUIT => app.exit(0),
                _ => {}
            });
    }

    #[cfg(desktop)]
    {
        builder = builder.on_tray_icon_event(|app, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Down,
                ..
            } => toggle_main_window(app),
            TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => toggle_main_window(app),
            _ => {}
        });
    }

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(bridge) = app.try_state::<McpBridgeRuntime>() {
                bridge.shutdown();
            }
            if let Some(export_runtime) = app.try_state::<VideoExportRuntime>() {
                export_runtime.shutdown();
            }
        }

        #[cfg(desktop)]
        if matches!(event, tauri::RunEvent::Ready) {
            let Ok(menu) = MenuBuilder::new(app)
                .text(TRAY_MENU_SHOW, "显示窗口")
                .text(TRAY_MENU_HIDE, "隐藏到托盘")
                .separator()
                .text(TRAY_MENU_QUIT, "退出")
                .build()
            else {
                return;
            };

            if let Some(tray) = app.tray_by_id(TRAY_ID) {
                let _ = tray.set_menu(Some(menu));
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_test_dir(prefix: &str) -> PathBuf {
        let unique = format!(
            "{prefix}_{}_{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        std::env::temp_dir().join(unique)
    }

    #[test]
    fn decode_hex_utf8_roundtrips_cjk_and_rejects_invalid() {
        let original = "C:\\测试目录\\m7-导出.mp4";
        let encoded: String = original.as_bytes().iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(decode_hex_utf8(&encoded).unwrap(), original);
        assert!(decode_hex_utf8("abc").is_err());
        assert!(decode_hex_utf8("zz").is_err());
    }

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
    fn global_settings_defaults_use_webgl_video_export_to_true_for_legacy_configs() {
        let legacy_json = r#"{
            "playheadStepMs": 16.666667,
            "danmakuDuration": { "mode": "ms", "value": 5000 },
            "aggressiveOptimization": false
        }"#;
        let parsed: GlobalSettings = serde_json::from_str(legacy_json).unwrap();
        assert!(parsed.use_webgl_video_export);

        let disabled_json = r#"{
            "playheadStepMs": 16.666667,
            "danmakuDuration": { "mode": "ms", "value": 5000 },
            "aggressiveOptimization": false,
            "useWebglVideoExport": false
        }"#;
        let disabled: GlobalSettings = serde_json::from_str(disabled_json).unwrap();
        assert!(!disabled.use_webgl_video_export);
    }

    #[test]
    fn prepare_video_export_path_validates_and_creates_parent() {
        let root = unique_test_dir("m7_editor_export_path_test");
        let nested_mp4 = root.join("nested").join("output.mp4");
        let prepared = prepare_video_export_path_inner(&nested_mp4.to_string_lossy()).unwrap();
        assert_eq!(prepared, nested_mp4);
        assert!(root.join("nested").is_dir());

        assert!(prepare_video_export_path_inner("relative/output.mp4").is_err());
        assert!(prepare_video_export_path_inner(&root.join("..").join("output.mp4").to_string_lossy()).is_err());

        let wrong_ext = root.join("output.mov");
        assert!(prepare_video_export_path_inner(&wrong_ext.to_string_lossy()).is_err());

        let reserved = root.join("CON.mp4");
        assert!(prepare_video_export_path_inner(&reserved.to_string_lossy()).is_err());

        let dir_named_mp4 = root.join("folder.mp4");
        std::fs::create_dir_all(&dir_named_mp4).unwrap();
        assert!(prepare_video_export_path_inner(&dir_named_mp4.to_string_lossy()).is_err());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn normalize_video_export_default_filename_handles_project_names_and_fallbacks() {
        assert_eq!(normalize_video_export_default_filename(None), "m7-export.mp4");
        assert_eq!(normalize_video_export_default_filename(Some("   ")), "m7-export.mp4");
        assert_eq!(normalize_video_export_default_filename(Some("我的工程")), "我的工程.mp4");
        assert_eq!(normalize_video_export_default_filename(Some("demo.MP4")), "demo.mp4");
        assert_eq!(normalize_video_export_default_filename(Some("bad:name/v1")), "bad_name_v1.mp4");
        assert_eq!(normalize_video_export_default_filename(Some("...mp4")), "m7-export.mp4");
        assert_eq!(normalize_video_export_default_filename(Some("CON.mp4")), "_CON.mp4");
    }

    #[test]
    fn sanitize_and_single_file_validation_prevent_traversal_and_reserved_names() {
        assert_eq!(sanitize_file_name("CON"), "_CON");
        assert_eq!(sanitize_file_name("nul.json"), "_nul.json");
        assert_eq!(sanitize_file_name("  ..  "), "Project");
        assert!(sanitize_file_name_core("...").is_none());

        assert!(validate_single_file_name("project.json", "工程文件").is_ok());
        assert!(validate_single_file_name("../secret.json", "工程文件").is_err());
        assert!(validate_single_file_name("sub/project.json", "工程文件").is_err());
        assert!(validate_single_file_name("sub\\project.json", "工程文件").is_err());
        assert!(validate_single_file_name("CON.json", "工程文件").is_err());
        assert!(validate_single_file_name("..", "工程文件").is_err());
        assert!(validate_single_file_name("", "工程文件").is_err());
    }

    #[test]
    fn write_json_is_atomic_and_read_bounded_enforces_limit() {
        let root = unique_test_dir("m7_editor_json_test");
        fs::create_dir_all(&root).unwrap();
        let target = root.join("project.json");
        let payload = json!({ "name": "demo", "danmakus": [1, 2, 3] });
        write_json(&target, &payload).unwrap();

        let loaded: Value = read_json_bounded(&target, 1024).unwrap();
        assert_eq!(loaded, payload);
        assert!(read_json_bounded::<Value>(&target, 4).is_err());

        // Ensure no leftover .tmp files exist next to target
        let leftover_tmps: Vec<_> = fs::read_dir(&root)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(leftover_tmps.is_empty());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn constant_time_equal_and_uuid_and_header_end_checks() {
        assert!(constant_time_equal("Bearer abc123", "Bearer abc123"));
        assert!(!constant_time_equal("Bearer abc123", "Bearer abc124"));
        assert!(!constant_time_equal("Bearer abc123", "Bearer abc"));

        assert!(is_valid_uuid_v4_like("550e8400-e29b-41d4-a716-446655440000"));
        assert!(!is_valid_uuid_v4_like("550e8400e29b-41d4-a716-446655440000"));
        assert!(!is_valid_uuid_v4_like("not-a-uuid"));

        assert_eq!(find_http_header_end(b"POST /rpc HTTP/1.1\r\n\r\n{}"), Some(18));
        assert_eq!(find_http_header_end(b"POST /rpc HTTP/1.1\r\n"), None);
    }

    #[test]
    fn copy_file_safely_preserves_content_when_source_equals_target() {
        let root = unique_test_dir("m7_editor_copy_same_test");
        fs::create_dir_all(&root).unwrap();
        let file = root.join("video.mp4");
        fs::write(&file, b"sample-media-bytes").unwrap();

        copy_file_safely(&file, &file, "媒体文件").unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"sample-media-bytes");

        let copy_dest = root.join("copy.mp4");
        copy_file_safely(&file, &copy_dest, "媒体文件").unwrap();
        assert_eq!(fs::read(&copy_dest).unwrap(), b"sample-media-bytes");

        let _ = fs::remove_dir_all(&root);
    }
}
