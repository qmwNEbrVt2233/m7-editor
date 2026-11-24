use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime},
};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{
    fs_utils::{now_millis, read_text_file_bounded, write_json},
    MAIN_WINDOW_LABEL,
};

const MCP_DESCRIPTOR_PREFIX: &str = "m7-editor-mcp-bridge-";
const MCP_MAX_BODY_BYTES: usize = 1024 * 1024;
const MCP_MAX_JSON_FILE_BYTES: u64 = 32 * 1024 * 1024;
const MCP_MAX_HEADER_BYTES: usize = 8192;
const MCP_MAX_CONCURRENT_CONNECTIONS: usize = 32;
const MCP_MAX_PENDING_REQUESTS: usize = 64;
static MCP_REQUEST_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Clone)]
pub(crate) struct McpBridgeRuntime {
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
    pub(crate) fn start(app: AppHandle) -> Result<Self, String> {
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
                                // Closure is dropped on spawn failure, which drops `guard`.
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
            Ok(value) => {
                write_mcp_http_response(&mut stream, 200, "OK", &json!({ "result": value }))
            }
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
                    if trimmed_value.is_empty()
                        || !trimmed_value.bytes().all(|b| b.is_ascii_digit())
                    {
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
            return Err((
                400,
                "请求必须使用固定长度的 application/json 内容".to_string(),
            ));
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
        let mut body =
            Vec::with_capacity(leftover.len().saturating_add(remaining.min(64 * 1024)));
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
            Some(Value::Object(_)) => request_obj
                .get("params")
                .cloned()
                .unwrap_or_else(|| json!({})),
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
                    format!(
                        "编辑器未在 {} 秒内响应 MCP 请求",
                        response_timeout.as_secs()
                    ),
                ))
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                Err((503, "编辑器 MCP 请求通道已关闭".to_string()))
            }
        }
    }

    fn complete(
        &self,
        request_id: String,
        result: Option<Value>,
        error: Option<String>,
    ) -> Result<(), String> {
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

    pub(crate) fn shutdown(&self) {
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
pub(crate) fn complete_mcp_request(
    bridge: State<'_, McpBridgeRuntime>,
    request_id: String,
    result: Option<Value>,
    error: Option<String>,
) -> Result<(), String> {
    bridge.complete(request_id, result, error)
}

#[tauri::command]
pub(crate) fn set_mcp_frontend_ready(bridge: State<'_, McpBridgeRuntime>, ready: bool) {
    bridge.set_frontend_ready(ready);
}

fn read_mcp_json_file_inner(path: &Path) -> Result<Value, String> {
    if path.as_os_str().is_empty() {
        return Err("JSON 文件路径不能为空".to_string());
    }
    let raw = read_text_file_bounded(path, MCP_MAX_JSON_FILE_BYTES, "MCP JSON 文件")?;
    let trimmed = raw.trim_start_matches('\u{feff}');
    serde_json::from_str::<Value>(trimmed)
        .map_err(|error| format!("无法解析 MCP JSON 文件 {}: {error}", path.display()))
}

fn write_mcp_json_file_inner(path: &Path, value: &Value) -> Result<u64, String> {
    if path.as_os_str().is_empty() {
        return Err("输出路径不能为空".to_string());
    }
    if !path.is_absolute() {
        return Err("输出路径必须是绝对路径".to_string());
    }
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("输出路径不能包含 .. 路径段".to_string());
    }
    if path.exists() && path.is_dir() {
        return Err("输出路径不能指向已存在的目录".to_string());
    }
    write_json(path, value)?;
    Ok(fs::metadata(path).map(|meta| meta.len()).unwrap_or(0))
}

#[tauri::command]
pub(crate) async fn read_mcp_json_file(path: String) -> Result<Value, String> {
    let trimmed = path.trim().to_string();
    if trimmed.is_empty() {
        return Err("JSON 文件路径不能为空".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || read_mcp_json_file_inner(Path::new(&trimmed)))
        .await
        .map_err(|error| format!("读取 MCP JSON 文件失败: {error}"))?
}

#[tauri::command]
pub(crate) async fn write_mcp_json_file(path: String, value: Value) -> Result<u64, String> {
    let trimmed = path.trim().to_string();
    if trimmed.is_empty() {
        return Err("输出路径不能为空".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || write_mcp_json_file_inner(Path::new(&trimmed), &value))
        .await
        .map_err(|error| format!("写入 MCP JSON 文件失败: {error}"))?
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

#[cfg(any(unix, windows))]
fn create_mcp_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    #[cfg(unix)]
    {
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

#[cfg(not(any(unix, windows)))]
fn create_mcp_token() -> Result<String, String> {
    Err("当前平台不支持安全生成 MCP 鉴权令牌".to_string())
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fs_utils::unique_test_dir;

    #[test]
    fn constant_time_equal_and_header_end_checks() {
        assert!(constant_time_equal("Bearer abc123", "Bearer abc123"));
        assert!(!constant_time_equal("Bearer abc123", "Bearer abc124"));
        assert!(!constant_time_equal("Bearer abc123", "Bearer abc"));

        assert_eq!(find_http_header_end(b"POST /rpc HTTP/1.1\r\n\r\n{}"), Some(18));
        assert_eq!(find_http_header_end(b"POST /rpc HTTP/1.1\r\n"), None);
    }

    #[test]
    fn mcp_json_file_roundtrip_bom_parent_dir_and_validation() {
        let root = unique_test_dir("m7_mcp_json_io");
        let nested_out = root.join("nested").join("out.json");
        let payload = json!({ "danmakus": [{ "id": "1" }], "total": 1 });

        let written_bytes = write_mcp_json_file_inner(&nested_out, &payload).unwrap();
        assert!(written_bytes > 0);
        assert_eq!(read_mcp_json_file_inner(&nested_out).unwrap(), payload);

        let bom_path = root.join("bom.json");
        fs::write(&bom_path, "\u{feff}{\"ok\":true}").unwrap();
        assert_eq!(read_mcp_json_file_inner(&bom_path).unwrap(), json!({ "ok": true }));

        // Directory target must be rejected
        assert!(write_mcp_json_file_inner(&root, &payload).is_err());

        // Relative or .. paths must be rejected for write
        assert!(write_mcp_json_file_inner(Path::new("relative.json"), &payload).is_err());
        assert!(write_mcp_json_file_inner(&root.join("..").join("escape.json"), &payload).is_err());

        let _ = fs::remove_dir_all(&root);
    }
}
