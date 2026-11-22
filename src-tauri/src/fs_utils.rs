use std::{
    fs::{self, File, OpenOptions},
    io::{BufReader, BufWriter, Write},
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

pub(crate) const MAX_IMPORT_TEXT_BYTES: u64 = 128 * 1024 * 1024;
static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(1);

pub(crate) fn next_temp_file_seq() -> u64 {
    TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
}

pub(crate) fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

pub(crate) fn backup_timestamp(timestamp: i64) -> String {
    let seconds = timestamp / 1000;
    let millis = (timestamp % 1000).abs();
    format!("{seconds}_{millis:03}")
}

pub(crate) fn is_windows_reserved_name(name: &str) -> bool {
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

pub(crate) fn sanitize_file_name_core(name: &str) -> Option<String> {
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

pub(crate) fn sanitize_file_name(name: &str) -> String {
    sanitize_file_name_core(name).unwrap_or_else(|| "Project".to_string())
}

pub(crate) fn validate_single_file_name(name: &str, label: &str) -> Result<String, String> {
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

pub(crate) fn resolve_file_inside_dir(
    base_dir: &Path,
    file_name: &str,
    label: &str,
) -> Result<PathBuf, String> {
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

pub(crate) fn validate_absolute_dir_input(raw: &str, label: &str) -> Result<PathBuf, String> {
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

pub(crate) fn paths_refer_to_same_entry(left: &Path, right: &Path) -> bool {
    if left == right {
        return true;
    }
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

pub(crate) fn copy_file_safely(source: &Path, target: &Path, label: &str) -> Result<(), String> {
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
    let seq = next_temp_file_seq();
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

pub(crate) fn read_text_file_bounded(
    path: &Path,
    max_bytes: u64,
    label: &str,
) -> Result<String, String> {
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

pub(crate) fn read_json_bounded<T>(path: &Path, max_bytes: u64) -> Result<T, String>
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

pub(crate) fn read_json<T>(path: &Path) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    read_json_bounded(path, MAX_IMPORT_TEXT_BYTES)
}

pub(crate) fn write_json<T>(path: &Path, value: &T) -> Result<(), String>
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
    let seq = next_temp_file_seq();
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

#[cfg(windows)]
pub(crate) fn move_path_to_recycle_bin(path: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::Shell::{
        SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, FO_DELETE,
        SHFILEOPSTRUCTW,
    };

    let abs_path = fs::canonicalize(path).map_err(|e| format!("路径无效: {e}"))?;

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
pub(crate) fn move_path_to_recycle_bin(path: &Path) -> Result<(), String> {
    use std::process::Command;

    let abs_path = fs::canonicalize(path).map_err(|error| format!("路径无效: {error}"))?;
    let path_str = abs_path.to_string_lossy().into_owned();
    let escaped_path = path_str.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(
        r#"tell application "Finder" to delete POSIX file "{}""#,
        escaped_path
    );

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
        if detail.is_empty() {
            "未知错误"
        } else {
            &detail
        }
    ))
}

#[cfg(not(any(windows, target_os = "macos")))]
pub(crate) fn move_path_to_recycle_bin(path: &Path) -> Result<(), String> {
    let result = if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };
    result.map_err(|error| format!("删除失败: {error}"))
}

#[cfg(test)]
pub(crate) fn unique_test_dir(prefix: &str) -> PathBuf {
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

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
