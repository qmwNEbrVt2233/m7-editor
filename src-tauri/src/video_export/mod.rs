pub(crate) mod ffmpeg;
pub(crate) mod file;
pub(crate) mod render_window;
pub(crate) mod snapshot;

use std::{
    collections::{HashMap, HashSet},
    fs::File,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use serde_json::Value;
use tauri::ipc::Request;

use self::ffmpeg::FfmpegSession;

#[derive(Default)]
pub(crate) struct VideoExportRuntime {
    pub(crate) ffmpeg_processes: Mutex<HashMap<PathBuf, Arc<FfmpegSession>>>,
    pub(crate) starting_ffmpeg: Mutex<HashSet<PathBuf>>,
    pub(crate) export_files: Mutex<HashMap<PathBuf, Arc<Mutex<File>>>>,
    pub(crate) render_jobs: Mutex<HashMap<String, Value>>,
}

impl VideoExportRuntime {
    pub(crate) fn shutdown(&self) {
        let sessions: Vec<Arc<FfmpegSession>> =
            if let Ok(mut guard) = self.ffmpeg_processes.lock() {
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

pub(crate) fn decode_hex_utf8(hex: &str) -> Result<String, String> {
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

pub(crate) fn header_str<'a>(request: &'a Request<'_>, name: &str) -> Result<&'a str, String> {
    request
        .headers()
        .get(name)
        .ok_or_else(|| format!("缺少请求头 {name}"))?
        .to_str()
        .map_err(|_| format!("请求头 {name} 格式无效"))
}

pub(crate) fn parse_json_byte_array(value: &Value, label: &str) -> Result<Vec<u8>, String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_hex_utf8_roundtrips_cjk_and_rejects_invalid() {
        let original = "C:\\测试目录\\m7-导出.mp4";
        let encoded: String = original
            .as_bytes()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        assert_eq!(decode_hex_utf8(&encoded).unwrap(), original);
        assert!(decode_hex_utf8("abc").is_err());
        assert!(decode_hex_utf8("zz").is_err());
    }
}
