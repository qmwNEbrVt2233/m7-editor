use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::{
    config::documents_data_dirs,
    fs_utils::{
        move_path_to_recycle_bin, now_millis, paths_refer_to_same_entry, read_text_file_bounded,
        resolve_file_inside_dir, sanitize_file_name_core, write_json, MAX_IMPORT_TEXT_BYTES,
    },
    APP_VERSION,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreationPresetRecord {
    pub(crate) name: String,
    pub(crate) created_at: i64,
    pub(crate) last_change_at: i64,
    pub(crate) state: Value,
}

fn preset_file_path_in_dir(presets_dir: &Path, name: &str) -> Result<(String, PathBuf), String> {
    let Some(sanitized) = sanitize_file_name_core(name) else {
        return Err("预设名称不能为空或仅包含无效字符".to_string());
    };
    let path = resolve_file_inside_dir(presets_dir, &format!("{sanitized}.json"), "预设")?;
    Ok((sanitized, path))
}

fn presets_dir_for_app(app: &AppHandle) -> Result<PathBuf, String> {
    let (data_dir, _, _) = documents_data_dirs(app)?;
    let presets_dir = data_dir.join("presets");
    fs::create_dir_all(&presets_dir).map_err(|error| format!("无法创建预设目录: {error}"))?;
    Ok(presets_dir)
}

fn read_preset_json_value(path: &Path, label: &str) -> Result<Value, String> {
    let raw = read_text_file_bounded(path, MAX_IMPORT_TEXT_BYTES, label)?;
    let trimmed = raw.trim_start_matches('\u{feff}');
    serde_json::from_str::<Value>(trimmed)
        .map_err(|error| format!("无法解析{label} {}: {error}", path.display()))
}

fn extract_preset_state(value: &Value, name: &str) -> Result<Value, String> {
    if let Some(state) = value.get("state") {
        if state.is_object() {
            return Ok(state.clone());
        }
        return Err(format!("预设 {name} 的 state 字段必须是 JSON 对象"));
    }

    if value.is_object()
        && value.get("numericRules").is_some()
        && value.get("colorRule").is_some()
        && value.get("directRules").is_some()
    {
        return Ok(value.clone());
    }

    Err(format!("预设 {name} 缺少有效的 state 对象"))
}

pub(crate) fn list_presets_in_dir(presets_dir: &Path) -> Result<Vec<CreationPresetRecord>, String> {
    fs::create_dir_all(presets_dir).map_err(|error| format!("无法读取预设目录: {error}"))?;
    let mut entries = fs::read_dir(presets_dir)
        .map_err(|error| format!("无法读取预设目录: {error}"))?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry.file_type().is_ok_and(|ft| ft.is_file())
                && entry
                    .path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
        })
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());

    entries
        .into_iter()
        .map(|entry| {
            let entry_path = entry.path();
            let name = entry_path
                .file_stem()
                .and_then(|value| value.to_str())
                .ok_or_else(|| "预设文件名无效".to_string())?
                .to_string();
            let value = read_preset_json_value(&entry_path, "预设文件")?;
            let state = extract_preset_state(&value, &name)?;
            let created_at = value.get("createdAt").and_then(Value::as_i64).unwrap_or(0);
            let last_change_at = value
                .get("lastChangeAt")
                .and_then(Value::as_i64)
                .unwrap_or(created_at);
            Ok(CreationPresetRecord {
                name,
                created_at,
                last_change_at,
                state,
            })
        })
        .collect()
}

pub(crate) fn create_preset_in_dir(
    presets_dir: &Path,
    name: &str,
    state: Value,
    created_at: Option<i64>,
    last_change_at: Option<i64>,
) -> Result<CreationPresetRecord, String> {
    if !state.is_object() {
        return Err("预设内容 state 必须是 JSON 对象".to_string());
    }
    fs::create_dir_all(presets_dir).map_err(|error| format!("无法创建预设目录: {error}"))?;
    let (sanitized_name, path) = preset_file_path_in_dir(presets_dir, name)?;
    if path.exists() {
        return Err("同名预设已存在".to_string());
    }
    let now = now_millis();
    let effective_created = created_at.filter(|&v| v > 0).unwrap_or(now);
    let effective_updated = last_change_at.filter(|&v| v > 0).unwrap_or(effective_created);
    write_json(
        &path,
        &json!({
            "version": APP_VERSION,
            "createdAt": effective_created,
            "lastChangeAt": effective_updated,
            "state": state
        }),
    )?;
    Ok(CreationPresetRecord {
        name: sanitized_name,
        created_at: effective_created,
        last_change_at: effective_updated,
        state,
    })
}

pub(crate) fn update_preset_in_dir(
    presets_dir: &Path,
    name: &str,
    state: Value,
) -> Result<CreationPresetRecord, String> {
    if !state.is_object() {
        return Err("预设内容 state 必须是 JSON 对象".to_string());
    }
    let (sanitized_name, path) = preset_file_path_in_dir(presets_dir, name)?;
    if !path.is_file() {
        return Err("预设不存在".to_string());
    }
    let now = now_millis();
    let mut existing = read_preset_json_value(&path, "预设文件")?;
    let object = existing
        .as_object_mut()
        .ok_or_else(|| "预设文件内容必须是 JSON 对象".to_string())?;
    let created_at = object
        .get("createdAt")
        .and_then(Value::as_i64)
        .filter(|&v| v > 0)
        .unwrap_or(now);
    object.insert("version".to_string(), json!(APP_VERSION));
    object.insert("createdAt".to_string(), json!(created_at));
    object.insert("lastChangeAt".to_string(), json!(now));
    object.insert("state".to_string(), state.clone());
    write_json(&path, &existing)?;
    Ok(CreationPresetRecord {
        name: sanitized_name,
        created_at,
        last_change_at: now,
        state,
    })
}

pub(crate) fn rename_preset_in_dir(
    presets_dir: &Path,
    name: &str,
    new_name: &str,
) -> Result<String, String> {
    let (_old_sanitized, old_path) = preset_file_path_in_dir(presets_dir, name)?;
    let (new_sanitized, new_path) = preset_file_path_in_dir(presets_dir, new_name)?;
    if !old_path.is_file() {
        return Err("预设不存在".to_string());
    }
    if old_path != new_path
        && new_path.exists()
        && !paths_refer_to_same_entry(&old_path, &new_path)
    {
        return Err("同名预设已存在".to_string());
    }
    if old_path != new_path {
        fs::rename(&old_path, &new_path)
            .map_err(|error| format!("无法重命名预设: {error}"))?;
    }
    Ok(new_sanitized)
}

pub(crate) fn delete_preset_in_dir(
    presets_dir: &Path,
    name: &str,
    use_recycle_bin: bool,
) -> Result<(), String> {
    let (_sanitized, path) = preset_file_path_in_dir(presets_dir, name)?;
    if !path.is_file() {
        return Err("预设不存在".to_string());
    }
    if use_recycle_bin {
        move_path_to_recycle_bin(&path)
    } else {
        fs::remove_file(&path).map_err(|error| format!("删除预设失败: {error}"))
    }
}

#[tauri::command]
pub(crate) async fn list_creation_presets(
    app: AppHandle,
) -> Result<Vec<CreationPresetRecord>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = presets_dir_for_app(&app)?;
        list_presets_in_dir(&dir)
    })
    .await
    .map_err(|error| format!("读取预设列表失败: {error}"))?
}

#[tauri::command]
pub(crate) async fn create_creation_preset(
    app: AppHandle,
    name: String,
    state: Value,
    created_at: Option<i64>,
    last_change_at: Option<i64>,
) -> Result<CreationPresetRecord, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = presets_dir_for_app(&app)?;
        create_preset_in_dir(&dir, &name, state, created_at, last_change_at)
    })
    .await
    .map_err(|error| format!("创建预设失败: {error}"))?
}

#[tauri::command]
pub(crate) async fn update_creation_preset(
    app: AppHandle,
    name: String,
    state: Value,
) -> Result<CreationPresetRecord, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = presets_dir_for_app(&app)?;
        update_preset_in_dir(&dir, &name, state)
    })
    .await
    .map_err(|error| format!("更新预设失败: {error}"))?
}

#[tauri::command]
pub(crate) async fn rename_creation_preset(
    app: AppHandle,
    name: String,
    new_name: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = presets_dir_for_app(&app)?;
        rename_preset_in_dir(&dir, &name, &new_name)
    })
    .await
    .map_err(|error| format!("重命名预设失败: {error}"))?
}

#[tauri::command]
pub(crate) async fn delete_creation_preset(app: AppHandle, name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = presets_dir_for_app(&app)?;
        delete_preset_in_dir(&dir, &name, true)
    })
    .await
    .map_err(|error| format!("删除预设失败: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fs_utils::unique_test_dir;

    fn sample_state(qty: &str) -> Value {
        json!({
            "quantityInput": qty,
            "expressionEnabled": false,
            "writeMode": "replace",
            "numericRules": {},
            "colorRule": {},
            "directRules": {}
        })
    }

    #[test]
    fn preset_crud_and_list_roundtrip() {
        let dir = unique_test_dir("m7_presets_crud");
        let created = create_preset_in_dir(&dir, "测试预设", sample_state("10"), Some(12345), None)
            .unwrap();
        assert_eq!(created.name, "测试预设");
        assert_eq!(created.created_at, 12345);
        assert_eq!(created.last_change_at, 12345);

        assert!(create_preset_in_dir(&dir, "测试预设", sample_state("20"), None, None).is_err());

        let updated = update_preset_in_dir(&dir, "测试预设", sample_state("25")).unwrap();
        assert_eq!(updated.created_at, 12345);
        assert!(updated.last_change_at >= 12345);
        assert_eq!(updated.state["quantityInput"], "25");

        let renamed = rename_preset_in_dir(&dir, "测试预设", "新预设").unwrap();
        assert_eq!(renamed, "新预设");
        assert!(!dir.join("测试预设.json").exists());
        assert!(dir.join("新预设.json").is_file());

        let list = list_presets_in_dir(&dir).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "新预设");
        assert_eq!(list[0].state["quantityInput"], "25");

        delete_preset_in_dir(&dir, "新预设", false).unwrap();
        assert!(list_presets_in_dir(&dir).unwrap().is_empty());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_handles_utf8_bom_and_raw_panel_state_and_rename_edge_cases() {
        let dir = unique_test_dir("m7_presets_edge");
        fs::create_dir_all(&dir).unwrap();

        let bom_raw = format!(
            "\u{feff}{}",
            serde_json::to_string_pretty(&sample_state("7")).unwrap()
        );
        fs::write(dir.join("raw_state.json"), bom_raw).unwrap();

        create_preset_in_dir(&dir, "Alpha", sample_state("1"), None, None).unwrap();
        create_preset_in_dir(&dir, "Beta", sample_state("2"), None, None).unwrap();

        // Colliding with another preset must fail
        assert!(rename_preset_in_dir(&dir, "Alpha", "Beta").is_err());

        // Case-only rename of the same preset succeeds
        let case_renamed = rename_preset_in_dir(&dir, "Alpha", "alpha").unwrap();
        assert_eq!(case_renamed, "alpha");

        // Reserved or invalid names are rejected or sanitized safely
        assert!(create_preset_in_dir(&dir, "...", sample_state("1"), None, None).is_err());
        let reserved = create_preset_in_dir(&dir, "CON", sample_state("3"), None, None).unwrap();
        assert_eq!(reserved.name, "_CON");

        let list = list_presets_in_dir(&dir).unwrap();
        assert_eq!(list.len(), 4);
        let raw_entry = list.iter().find(|p| p.name == "raw_state").unwrap();
        assert_eq!(raw_entry.state["quantityInput"], "7");

        let _ = fs::remove_dir_all(&dir);
    }
}
