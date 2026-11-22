use std::{fs, path::PathBuf};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::{
    config::documents_data_dirs,
    fs_utils::{
        move_path_to_recycle_bin, now_millis, paths_refer_to_same_entry, read_json,
        resolve_file_inside_dir, sanitize_file_name_core, write_json,
    },
    APP_VERSION,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DanmakuTemplateRecord {
    pub(crate) name: String,
    pub(crate) created_at: i64,
    pub(crate) last_change_at: i64,
    pub(crate) danmakus: Vec<Value>,
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
pub(crate) async fn list_danmaku_templates(
    app: AppHandle,
) -> Result<Vec<DanmakuTemplateRecord>, String> {
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
pub(crate) async fn create_danmaku_template(
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
pub(crate) async fn update_danmaku_template(
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
pub(crate) async fn rename_danmaku_template(
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
        if old_path != new_path
            && new_path.exists()
            && !paths_refer_to_same_entry(&old_path, &new_path)
        {
            return Err("同名模板已存在".to_string());
        }
        fs::rename(old_path, new_path).map_err(|error| format!("无法重命名模板: {error}"))
    })
    .await
    .map_err(|error| format!("重命名模板失败: {error}"))?
}

#[tauri::command]
pub(crate) async fn delete_danmaku_template(app: AppHandle, name: String) -> Result<(), String> {
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
