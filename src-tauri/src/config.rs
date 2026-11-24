use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::{
    fs_utils::{backup_timestamp, now_millis, read_json, write_json},
    projects::{project_summary, ProjectSummary, PROJECT_CONFIG_FILE},
    APP_VERSION,
};

const APP_DIR_NAME: &str = "m7-editor";
const APP_CONFIG_FILE: &str = "config.json";

#[derive(Default)]
pub(crate) struct FileSystemRuntime {
    pub(crate) log_file: Mutex<Option<File>>,
    pub(crate) config_lock: Mutex<()>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppConfig {
    pub(crate) version: String,
    pub(crate) projects: Vec<String>,
    #[serde(default)]
    pub(crate) global_settings: GlobalSettings,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GlobalSettings {
    pub(crate) playhead_step_ms: f64,
    pub(crate) danmaku_duration: DanmakuDurationSettings,
    pub(crate) aggressive_optimization: bool,
    #[serde(default)]
    pub(crate) selected_danmaku_template_name: Option<String>,
    #[serde(default)]
    pub(crate) replace_default_danmaku_with_template: bool,
    #[serde(default = "default_true")]
    pub(crate) use_webgl_video_export: bool,
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
pub(crate) struct DanmakuDurationSettings {
    pub(crate) mode: String,
    pub(crate) value: f64,
}

impl Default for DanmakuDurationSettings {
    fn default() -> Self {
        Self {
            mode: "ms".to_string(),
            value: 1000.0,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileSystemStateDto {
    pub(crate) config_path: String,
    pub(crate) documents_data_dir: String,
    pub(crate) logs_dir: String,
    pub(crate) default_projects_dir: String,
    pub(crate) projects: Vec<ProjectSummary>,
    pub(crate) global_settings: GlobalSettings,
}

pub(crate) fn app_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("无法获取应用配置目录: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建应用配置目录: {error}"))?;
    Ok(dir.join(APP_CONFIG_FILE))
}

pub(crate) fn documents_data_dirs(app: &AppHandle) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|error| format!("无法获取 Documents 目录: {error}"))?;
    let data_dir = documents.join(APP_DIR_NAME);
    let logs_dir = data_dir.join("logs");
    let projects_dir = data_dir.join("projects");
    let templates_dir = data_dir.join("templates");
    let presets_dir = data_dir.join("presets");

    fs::create_dir_all(&logs_dir).map_err(|error| format!("无法创建日志目录: {error}"))?;
    fs::create_dir_all(&projects_dir).map_err(|error| format!("无法创建默认工程目录: {error}"))?;
    fs::create_dir_all(&templates_dir).map_err(|error| format!("无法创建模板目录: {error}"))?;
    fs::create_dir_all(&presets_dir).map_err(|error| format!("无法创建预设目录: {error}"))?;

    Ok((data_dir, logs_dir, projects_dir))
}

fn default_app_config() -> AppConfig {
    AppConfig {
        version: APP_VERSION.to_string(),
        projects: Vec::new(),
        global_settings: GlobalSettings::default(),
    }
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

pub(crate) fn add_project_to_app_config(app: &AppHandle, project_path: &Path) -> Result<(), String> {
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

pub(crate) fn remove_project_from_app_config(
    app: &AppHandle,
    project_path: &Path,
) -> Result<(), String> {
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

pub(crate) fn replace_project_in_app_config(
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

pub(crate) fn initialize_file_system(app: &AppHandle) -> Result<File, String> {
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
pub(crate) async fn get_file_system_state(app: AppHandle) -> Result<FileSystemStateDto, String> {
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
pub(crate) async fn update_global_settings(
    app: AppHandle,
    settings: GlobalSettings,
) -> Result<(), String> {
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

#[tauri::command]
pub(crate) fn append_log(
    runtime: State<'_, FileSystemRuntime>,
    line: String,
) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
