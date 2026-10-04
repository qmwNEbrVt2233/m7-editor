use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::{Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{mpsc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{ipc::Response, AppHandle, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[cfg(desktop)]
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    WindowEvent,
};

const APP_VERSION: &str = "1.9.0";
const APP_DIR_NAME: &str = "m7-editor";
const APP_CONFIG_FILE: &str = "config.json";
const PROJECT_CONFIG_FILE: &str = "project_config.json";

#[derive(Serialize)]
struct MediaFile {
    path: String,
}

#[derive(Default)]
struct FileSystemRuntime {
    log_file: Mutex<Option<PathBuf>>,
}

#[derive(Default)]
struct VideoExportRuntime {
    ffmpeg_processes: Mutex<HashMap<String, Child>>,
    render_jobs: Mutex<HashMap<String, Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    version: String,
    projects: Vec<String>,
    #[serde(default)]
    global_settings: GlobalSettings,
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
}

impl Default for GlobalSettings {
    fn default() -> Self {
        Self {
            playhead_step_ms: 16.666667,
            danmaku_duration: DanmakuDurationSettings::default(),
            aggressive_optimization: false,
            selected_danmaku_template_name: None,
            replace_default_danmaku_with_template: false,
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

fn sanitize_file_name(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            character if character.is_control() => '_',
            character => character,
        })
        .collect();

    let trimmed = sanitized.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "Project".to_string()
    } else {
        trimmed
    }
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

fn read_json<T>(path: &Path) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let text = fs::read_to_string(path)
        .map_err(|error| format!("无法读取文件 {}: {error}", path.display()))?;
    serde_json::from_str(&text)
        .map_err(|error| format!("无法解析 JSON {}: {error}", path.display()))
}

fn write_json<T>(path: &Path, value: &T) -> Result<(), String>
where
    T: Serialize + ?Sized,
{
    let text =
        serde_json::to_string_pretty(value).map_err(|error| format!("无法序列化 JSON: {error}"))?;
    fs::write(path, text).map_err(|error| format!("无法写入文件 {}: {error}", path.display()))
}

fn load_app_config(app: &AppHandle) -> Result<AppConfig, String> {
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

fn save_app_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = app_config_path(app)?;
    write_json(&path, config)
}

fn add_project_to_app_config(app: &AppHandle, project_path: &Path) -> Result<(), String> {
    let canonical = project_path
        .canonicalize()
        .map_err(|error| format!("无法读取工程路径: {error}"))?;
    let path_text = canonical.to_string_lossy().into_owned();
    let mut config = load_app_config(app)?;

    if !config.projects.iter().any(|path| path == &path_text) {
        config.projects.push(path_text);
        config.projects.sort();
        save_app_config(app, &config)?;
    }

    Ok(())
}

fn remove_project_from_app_config(app: &AppHandle, project_path: &Path) -> Result<(), String> {
    let candidate = project_path.to_string_lossy().into_owned();
    let canonical = project_path
        .canonicalize()
        .ok()
        .map(|path| path.to_string_lossy().into_owned());
    let mut config = load_app_config(app)?;

    config.projects.retain(|path| {
        path != &candidate
            && canonical
                .as_ref()
                .is_none_or(|canonical_path| path != canonical_path)
    });

    save_app_config(app, &config)
}

fn load_project_config(project_dir: &Path) -> Result<ProjectConfig, String> {
    read_json(&project_dir.join(PROJECT_CONFIG_FILE))
}

fn save_project_config(project_dir: &Path, config: &ProjectConfig) -> Result<(), String> {
    write_json(&project_dir.join(PROJECT_CONFIG_FILE), config)
}

fn resolve_project_media_path(project_dir: &Path, config: &ProjectConfig) -> Option<PathBuf> {
    let media = config.media.as_ref()?;

    if media.use_external_link {
        return media
            .external_path
            .as_ref()
            .filter(|path| !path.is_empty())
            .map(PathBuf::from);
    }

    media
        .name
        .as_ref()
        .filter(|name| !name.is_empty())
        .map(|name| project_dir.join("media").join(name))
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
    let target = media_dir.join(&media_file_name);
    fs::copy(&canonical, &target).map_err(|error| format!("无法复制媒体文件: {error}"))?;

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

fn load_folder_project_payload(
    app: &AppHandle,
    project_dir: &Path,
) -> Result<FolderProjectPayload, String> {
    let canonical_dir = project_dir
        .canonicalize()
        .map_err(|error| format!("无法读取工程文件夹: {error}"))?;
    let config = load_project_config(&canonical_dir)?;
    let project_file = canonical_dir.join(&config.project_file);
    let mut project = read_json::<Value>(&project_file)?;
    let resolved_media = resolve_project_media_path(&canonical_dir, &config);
    let media_path = resolved_media.as_ref().filter(|path| path.is_file());
    set_project_media_value(&mut project, media_path.map(|p| p.as_path()));

    let mut warnings: Vec<String> = Vec::new();

    // 检测媒体文件缺失
    if config.media.is_some() {
        match &resolved_media {
            Some(expected_path) if !expected_path.is_file() => {
                warnings.push(format!(
                    "媒体文件不存在：{}",
                    expected_path.display()
                ));
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

fn project_summary(project_path: &Path) -> Result<ProjectSummary, String> {
    let canonical = project_path
        .canonicalize()
        .map_err(|error| format!("无法读取工程路径: {error}"))?;
    let config = load_project_config(&canonical)?;
    let project_exists = canonical.join(&config.project_file).is_file();
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
    let project_dir = project_path
        .canonicalize()
        .map_err(|error| format!("无法读取工程路径: {error}"))?;
    let mut config = load_project_config(&project_dir)?;
    let mut media_path =
        resolve_project_media_path(&project_dir, &config).filter(|path| path.is_file());

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
            let target = media_dir.join(&media_file_name);

            if let Some(old_path) = old_internal_media {
                if old_path != target && old_path.is_file() {
                    let _ = fs::remove_file(old_path);
                }
            }

            fs::copy(&next_media, &target).map_err(|error| format!("无法复制媒体文件: {error}"))?;
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
    write_json(&project_dir.join(&config.project_file), &project)?;
    save_project_config(&project_dir, &config)?;
    add_project_to_app_config(app, &project_dir)?;

    load_folder_project_payload(app, &project_dir)
}

fn backup_timestamp(timestamp: i64) -> String {
    let seconds = timestamp / 1000;
    let millis = timestamp % 1000;
    format!("{seconds}_{millis}")
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

fn initialize_file_system(app: &AppHandle) -> Result<PathBuf, String> {
    let (_data_dir, logs_dir, _projects_dir) = documents_data_dirs(app)?;
    let _ = load_app_config(app)?;
    let log_file = logs_dir.join(format!("m7-editor_{}.log", backup_timestamp(now_millis())));
    fs::write(&log_file, format!("m7-editor {APP_VERSION} log started\n"))
        .map_err(|error| format!("无法创建日志文件: {error}"))?;

    Ok(log_file)
}

#[tauri::command]
fn get_file_system_state(app: AppHandle) -> Result<FileSystemStateDto, String> {
    let config_path = app_config_path(&app)?;
    let (documents_data_dir, logs_dir, default_projects_dir) = documents_data_dirs(&app)?;
    let mut config = load_app_config(&app)?;

    // 清理已失效的注册路径（目录不存在或缺少 project_config.json）
    let invalid_paths: Vec<String> = config
        .projects
        .iter()
        .filter(|path_text| {
            let path = Path::new(path_text);
            !path.exists() || !path.join(PROJECT_CONFIG_FILE).is_file()
        })
        .cloned()
        .collect();

    if !invalid_paths.is_empty() {
        config.projects.retain(|path_text| {
            let path = Path::new(path_text);
            path.exists() && path.join(PROJECT_CONFIG_FILE).is_file()
        });
        save_app_config(&app, &config)?;
    }

    let projects = config
        .projects
        .iter()
        .filter_map(|path| project_summary(Path::new(path)).ok())
        .collect();

    Ok(FileSystemStateDto {
        config_path: config_path.to_string_lossy().into_owned(),
        documents_data_dir: documents_data_dir.to_string_lossy().into_owned(),
        logs_dir: logs_dir.to_string_lossy().into_owned(),
        default_projects_dir: default_projects_dir.to_string_lossy().into_owned(),
        projects,
        global_settings: config.global_settings,
    })
}

#[tauri::command]
fn update_global_settings(app: AppHandle, settings: GlobalSettings) -> Result<(), String> {
    let mut config = load_app_config(&app)?;
    config.global_settings = settings;
    save_app_config(&app, &config)
}

fn template_file_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let normalized_name = name.trim();
    if normalized_name.is_empty() {
        return Err("模板名称不能为空".to_string());
    }
    let (data_dir, _, _) = documents_data_dirs(app)?;
    Ok(data_dir
        .join("templates")
        .join(format!("{}.json", sanitize_file_name(normalized_name))))
}

#[tauri::command]
fn list_danmaku_templates(app: AppHandle) -> Result<Vec<DanmakuTemplateRecord>, String> {
    let (data_dir, _, _) = documents_data_dirs(&app)?;
    let templates_dir = data_dir.join("templates");
    let mut entries = fs::read_dir(&templates_dir)
        .map_err(|error| format!("无法读取模板目录: {error}"))?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
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
}

#[tauri::command]
fn create_danmaku_template(
    app: AppHandle,
    name: String,
    danmakus: Vec<Value>,
) -> Result<(), String> {
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
}

#[tauri::command]
fn update_danmaku_template(
    app: AppHandle,
    name: String,
    danmakus: Vec<Value>,
) -> Result<(), String> {
    let path = template_file_path(&app, &name)?;
    let mut value = read_json::<Value>(&path)?;
    let object = value
        .as_object_mut()
        .ok_or_else(|| "模板文件内容必须是 JSON 对象".to_string())?;
    object.insert("danmakus".to_string(), Value::Array(danmakus));
    object.insert("lastChangeAt".to_string(), json!(now_millis()));
    write_json(&path, &value)
}

#[tauri::command]
fn rename_danmaku_template(app: AppHandle, name: String, new_name: String) -> Result<(), String> {
    let old_path = template_file_path(&app, &name)?;
    let new_path = template_file_path(&app, &new_name)?;
    if !old_path.is_file() {
        return Err("模板不存在".to_string());
    }
    if old_path != new_path && new_path.exists() {
        return Err("同名模板已存在".to_string());
    }
    fs::rename(old_path, new_path).map_err(|error| format!("无法重命名模板: {error}"))
}

#[tauri::command]
fn delete_danmaku_template(app: AppHandle, name: String) -> Result<(), String> {
    let path = template_file_path(&app, &name)?;
    if !path.is_file() {
        return Err("模板不存在".to_string());
    }
    move_path_to_recycle_bin(&path)
}

#[tauri::command]
fn check_folder_project_path(parent_dir: String, name: String) -> Result<ProjectPathCheck, String> {
    let project_name = sanitize_file_name(&name);
    let path = PathBuf::from(parent_dir).join(project_name);

    Ok(ProjectPathCheck {
        exists: path.exists(),
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn create_folder_project(
    app: AppHandle,
    request: CreateFolderProjectRequest,
) -> Result<FolderProjectPayload, String> {
    let project_name = sanitize_file_name(&request.name);
    let parent_dir = PathBuf::from(request.parent_dir);
    fs::create_dir_all(&parent_dir).map_err(|error| format!("无法创建工程父目录: {error}"))?;

    let project_dir = parent_dir.join(&project_name);
    if project_dir.exists() {
        return Err(format!("工程目录已存在: {}", project_dir.display()));
    }

    fs::create_dir_all(project_dir.join("backup"))
        .map_err(|error| format!("无法创建备份目录: {error}"))?;
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

    let mut project = request.from_project.unwrap_or_else(|| {
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

    write_json(&project_dir.join(PROJECT_CONFIG_FILE), &config)?;
    write_json(&project_dir.join(project_file), &project)?;
    add_project_to_app_config(&app, &project_dir)?;

    load_folder_project_payload(&app, &project_dir)
}

#[tauri::command]
fn load_folder_project(
    app: AppHandle,
    project_path: String,
) -> Result<FolderProjectPayload, String> {
    load_folder_project_payload(&app, Path::new(&project_path))
}

#[tauri::command]
fn save_folder_project(
    app: AppHandle,
    request: SaveFolderProjectRequest,
) -> Result<FolderProjectPayload, String> {
    save_folder_project_inner(
        &app,
        Path::new(&request.project_path),
        request.project,
        request.pending_media_path,
    )
}

#[tauri::command]
fn backup_folder_project(
    app: AppHandle,
    request: SaveFolderProjectRequest,
) -> Result<FolderProjectPayload, String> {
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
    let backup_name = format!(
        "{}_backup_{}.json",
        sanitize_file_name(&payload.config.name),
        backup_timestamp(backed_up_at)
    );
    fs::copy(
        project_dir.join(&payload.config.project_file),
        backup_dir.join(backup_name),
    )
    .map_err(|error| format!("无法创建工程备份: {error}"))?;

    payload.config.last_back_up_at = Some(backed_up_at);
    payload.config.last_change_at = backed_up_at;
    save_project_config(&project_dir, &payload.config)?;
    payload = load_folder_project_payload(&app, &project_dir)?;
    Ok(payload)
}

#[tauri::command]
fn update_folder_project_config(
    app: AppHandle,
    request: UpdateFolderProjectConfigRequest,
) -> Result<ProjectSummary, String> {
    let project_dir = PathBuf::from(request.project_path)
        .canonicalize()
        .map_err(|error| format!("无法读取工程路径: {error}"))?;
    let mut config = request.config;
    config.last_change_at = now_millis();
    save_project_config(&project_dir, &config)?;
    add_project_to_app_config(&app, &project_dir)?;
    project_summary(&project_dir)
}

#[tauri::command]
fn edit_folder_project(
    app: AppHandle,
    request: EditFolderProjectRequest,
) -> Result<ProjectSummary, String> {
    let project_dir = PathBuf::from(&request.project_path)
        .canonicalize()
        .map_err(|error| format!("无法读取工程路径: {error}"))?;
    let mut config = load_project_config(&project_dir)?;
    let mut new_project_dir = project_dir.clone();
    let mut needs_rename = false;
    let mut needs_move = false;

    // 处理重命名
    if let Some(ref new_name) = request.name {
        let sanitized = sanitize_file_name(new_name);
        if sanitized != config.name {
            let parent = new_project_dir
                .parent()
                .ok_or("无法获取工程父目录")?
                .to_path_buf();
            let candidate = parent.join(&sanitized);
            if candidate.exists() && candidate != new_project_dir {
                return Err(format!("目标目录已存在: {}", candidate.display()));
            }
            let old_project_file = config.project_file.clone();
            let extension = std::path::Path::new(&config.project_file)
                .extension()
                .map(|ext| format!(".{}", ext.to_string_lossy()))
                .unwrap_or_else(|| ".json".to_string());
            let new_project_file = format!("{}{}", sanitized, extension);
            config.name = sanitized;
            config.project_file = new_project_file.clone();
            new_project_dir = candidate;
            needs_rename = true;

            let old_file_path = project_dir.join(&old_project_file);
            let new_file_path = project_dir.join(&new_project_file);
            if old_file_path.is_file() && !new_file_path.exists() {
                fs::rename(&old_file_path, &new_file_path)
                    .map_err(|error| format!("无法重命名工程文件: {error}"))?;
            }
        }
    }

    // 处理移动
    if let Some(ref new_parent) = request.new_parent_dir {
        let parent = PathBuf::from(new_parent);
        if parent != new_project_dir.parent().map(|p| p.to_path_buf()).unwrap_or_default() {
            fs::create_dir_all(&parent)
                .map_err(|error| format!("无法创建目标父目录: {error}"))?;
            let candidate = parent.join(new_project_dir.file_name().ok_or("无法获取工程文件夹名")?);
            if candidate.exists() && candidate != new_project_dir {
                return Err(format!("目标目录已存在: {}", candidate.display()));
            }
            new_project_dir = candidate;
            needs_move = true;
        }
    }

    // 处理媒体链接方式变更
    if request.media_use_external_link.is_some() || request.media_external_path.is_some() {
        let use_external = request.media_use_external_link.unwrap_or_else(|| {
            config.media.as_ref().map(|m| m.use_external_link).unwrap_or(false)
        });

        if use_external {
            let ext_path = request.media_external_path.clone().unwrap_or_else(|| {
                config.media.as_ref()
                    .and_then(|m| m.external_path.clone())
                    .unwrap_or_default()
            });
            if ext_path.is_empty() {
                config.media = None;
            } else {
                let file_name = std::path::Path::new(&ext_path)
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| config.name.clone());
                // 如果是内部模式切换到外部模式，删除内部副本
                if config.media.as_ref().is_some_and(|m| !m.use_external_link) {
                    if let Some(old_internal) = resolve_project_media_path(&project_dir, &config) {
                        if old_internal.is_file() {
                            let _ = fs::remove_file(&old_internal);
                        }
                    }
                }
                config.media = Some(ProjectMediaConfig {
                    name: Some(file_name),
                    use_external_link: true,
                    external_path: Some(ext_path),
                });
            }
        } else {
            // 切换到内部复制模式：尝试从当前路径复制媒体到工程内
            let source_path = config.media.as_ref()
                .and_then(|m| {
                    if m.use_external_link {
                        m.external_path.clone()
                    } else {
                        resolve_project_media_path(&project_dir, &config)
                            .map(|p| p.to_string_lossy().into_owned())
                    }
                })
                .unwrap_or_default();

            if source_path.is_empty() {
                config.media = None;
            } else {
                let source = Path::new(&source_path);
                if source.is_file() {
                    let extension = source
                        .extension()
                        .map(|ext| format!(".{}", ext.to_string_lossy()))
                        .unwrap_or_default();
                    let media_file_name = format!("{}{}", sanitize_file_name(&config.name), extension);
                    let media_dir = project_dir.join("media");
                    fs::create_dir_all(&media_dir)
                        .map_err(|error| format!("无法创建媒体目录: {error}"))?;
                    let target = media_dir.join(&media_file_name);
                    fs::copy(source, &target)
                        .map_err(|error| format!("无法复制媒体文件: {error}"))?;
                    config.media = Some(ProjectMediaConfig {
                        name: Some(media_file_name),
                        use_external_link: false,
                        external_path: None,
                    });
                }
            }
        }
    }

    // 处理描述
    if let Some(ref desc) = request.description {
        config.description = desc.clone();
    }

    config.last_change_at = now_millis();

    // 执行重命名/移动
    if needs_rename || needs_move {
        if new_project_dir != project_dir {
            if new_project_dir.exists() {
                return Err(format!("目标路径已存在: {}", new_project_dir.display()));
            }
            // 从旧注册中移除
            remove_project_from_app_config(&app, &project_dir)?;
            // 移动目录
            fs::rename(&project_dir, &new_project_dir)
                .map_err(|error| format!("无法移动/重命名工程目录: {error}"))?;
        }
        save_project_config(&new_project_dir, &config)?;
        add_project_to_app_config(&app, &new_project_dir)?;
        project_summary(&new_project_dir)
    } else {
        save_project_config(&project_dir, &config)?;
        add_project_to_app_config(&app, &project_dir)?;
        project_summary(&project_dir)
    }
}

#[tauri::command]
fn remove_folder_project(app: AppHandle, project_path: String) -> Result<(), String> {
    let project_dir = PathBuf::from(&project_path);
    if project_dir.exists() {
        move_path_to_recycle_bin(&project_dir)?;
    }
    remove_project_from_app_config(&app, &project_dir)
}

#[tauri::command]
fn append_log(runtime: tauri::State<FileSystemRuntime>, line: String) -> Result<(), String> {
    let Some(path) = runtime
        .log_file
        .lock()
        .map_err(|_| "日志状态锁定失败".to_string())?
        .clone()
    else {
        return Ok(());
    };

    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(&path)
        .map_err(|error| format!("无法打开日志文件: {error}"))?;
    writeln!(file, "{line}").map_err(|error| format!("无法写入日志文件: {error}"))
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
fn open_media_file_dialog() -> Result<Option<PathBuf>, String> {
    use windows::core::w;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{FileOpenDialog, IFileOpenDialog, SIGDN_FILESYSPATH};

    const HRESULT_FROM_WIN32_ERROR_CANCELLED: i32 = -2147023673;

    unsafe {
        let init_hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let should_uninitialize = init_hr.is_ok();

        if !init_hr.is_ok() {
            return Err(format!("初始化文件选择器失败: {init_hr:?}"));
        }

        let result = (|| {
            let dialog: IFileOpenDialog =
                CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
                    .map_err(|error| format!("创建文件选择器失败: {error}"))?;

            let filters = [
                COMDLG_FILTERSPEC {
                    pszName: w!("媒体文件"),
                    pszSpec: w!("*.mp4;*.mov;*.mkv;*.avi;*.webm;*.flv;*.wmv;*.mp3;*.wav;*.flac;*.aac;*.m4a;*.ogg"),
                },
                COMDLG_FILTERSPEC {
                    pszName: w!("所有文件"),
                    pszSpec: w!("*.*"),
                },
            ];

            dialog
                .SetTitle(w!("选择媒体文件"))
                .map_err(|error| format!("设置文件选择器标题失败: {error}"))?;
            dialog
                .SetFileTypes(&filters)
                .map_err(|error| format!("设置媒体文件筛选器失败: {error}"))?;

            if let Err(error) = dialog.Show(None) {
                if error.code().0 == HRESULT_FROM_WIN32_ERROR_CANCELLED {
                    return Ok(None);
                }

                return Err(format!("打开文件选择器失败: {error}"));
            }

            let item = dialog
                .GetResult()
                .map_err(|error| format!("读取文件选择结果失败: {error}"))?;
            let display_name = item
                .GetDisplayName(SIGDN_FILESYSPATH)
                .map_err(|error| format!("读取文件路径失败: {error}"))?;
            let path_result = display_name
                .to_string()
                .map_err(|error| format!("转换文件路径失败: {error}"));

            CoTaskMemFree(Some(display_name.0 as _));

            let path = path_result?;

            Ok(Some(PathBuf::from(path)))
        })();

        if should_uninitialize {
            CoUninitialize();
        }

        result
    }
}

#[cfg(target_os = "macos")]
fn open_media_file_dialog() -> Result<Option<PathBuf>, String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSModalResponseOK, NSOpenPanel};
    use objc2_foundation::{NSArray, NSString};

    let Some(mtm) = MainThreadMarker::new() else {
        return Err("macOS 文件选择器必须在主线程调用".to_string());
    };

    let panel = NSOpenPanel::openPanel(mtm);

    panel.setCanChooseFiles(true);
    panel.setCanChooseDirectories(false);
    panel.setAllowsMultipleSelection(false);

    let title = NSString::from_str("选择媒体文件");
    panel.setTitle(Some(&title));

    let extensions = ["mp4", "mov", "mkv", "avi", "mp3", "wav", "flac"];
    let ns_exts = extensions.map(NSString::from_str);
    let refs: Vec<&NSString> = ns_exts.iter().map(|extension| &**extension).collect();
    let allowed_types = NSArray::from_slice(&refs);

    #[allow(deprecated)]
    panel.setAllowedFileTypes(Some(&allowed_types));

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

// 保留针对其他平台的兜底
#[cfg(not(any(windows, target_os = "macos")))]
fn open_media_file_dialog() -> Result<Option<PathBuf>, String> {
    Err("当前平台暂未实现后端媒体文件选择器".to_string())
}

#[tauri::command]
fn open_media_file(app: AppHandle) -> Result<Option<MediaFile>, String> {
    let Some(path) = open_media_file_dialog()? else {
        return Ok(None);
    };

    let path = canonical_media_file(path)?;
    register_media_path(&app, path).map(Some)
}

#[cfg(windows)]
fn open_project_folder_dialog() -> Result<Option<PathBuf>, String> {
    use windows::core::w;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        FileOpenDialog, IFileOpenDialog, FOS_PICKFOLDERS, SIGDN_FILESYSPATH,
    };

    const HRESULT_FROM_WIN32_ERROR_CANCELLED: i32 = -2147023673;

    unsafe {
        let init_hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let should_uninitialize = init_hr.is_ok();

        if !init_hr.is_ok() {
            return Err(format!("初始化文件夹选择器失败: {init_hr:?}"));
        }

        let result = (|| {
            let dialog: IFileOpenDialog =
                CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
                    .map_err(|error| format!("创建文件夹选择器失败: {error}"))?;

            dialog
                .SetOptions(FOS_PICKFOLDERS)
                .map_err(|error| format!("设置文件夹选择器失败: {error}"))?;
            dialog
                .SetTitle(w!("选择工程文件夹"))
                .map_err(|error| format!("设置文件夹选择器标题失败: {error}"))?;

            if let Err(error) = dialog.Show(None) {
                if error.code().0 == HRESULT_FROM_WIN32_ERROR_CANCELLED {
                    return Ok(None);
                }

                return Err(format!("打开文件夹选择器失败: {error}"));
            }

            let item = dialog
                .GetResult()
                .map_err(|error| format!("读取文件夹选择结果失败: {error}"))?;
            let display_name = item
                .GetDisplayName(SIGDN_FILESYSPATH)
                .map_err(|error| format!("读取文件夹路径失败: {error}"))?;
            let path_result = display_name
                .to_string()
                .map_err(|error| format!("转换文件夹路径失败: {error}"));

            CoTaskMemFree(Some(display_name.0 as _));

            let path = path_result?;

            Ok(Some(PathBuf::from(path)))
        })();

        if should_uninitialize {
            CoUninitialize();
        }

        result
    }
}

#[cfg(target_os = "macos")]
fn open_project_folder_dialog() -> Result<Option<PathBuf>, String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSModalResponseOK, NSOpenPanel};
    use objc2_foundation::NSString;

    let Some(mtm) = MainThreadMarker::new() else {
        return Err("macOS 文件夹选择器必须在主线程调用".to_string());
    };

    let panel = NSOpenPanel::openPanel(mtm);
    panel.setCanChooseFiles(false);
    panel.setCanChooseDirectories(true);
    panel.setAllowsMultipleSelection(false);
    let title = NSString::from_str("选择工程文件夹");
    panel.setTitle(Some(&title));

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

#[cfg(not(any(windows, target_os = "macos")))]
fn open_project_folder_dialog() -> Result<Option<PathBuf>, String> {
    Err("当前平台暂未实现后端文件夹选择器".to_string())
}

#[tauri::command]
fn choose_project_folder() -> Result<Option<String>, String> {
    Ok(open_project_folder_dialog()?.map(|path| path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn import_folder_project(app: AppHandle) -> Result<Option<FolderProjectPayload>, String> {
    let Some(path) = open_project_folder_dialog()? else {
        return Ok(None);
    };

    let payload = load_folder_project_payload(&app, &path)?;
    add_project_to_app_config(&app, Path::new(&payload.path))?;
    Ok(Some(payload))
}

#[cfg(windows)]
fn open_project_file_dialog() -> Result<Option<PathBuf>, String> {
    use windows::core::w;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{FileOpenDialog, IFileOpenDialog, SIGDN_FILESYSPATH};

    const HRESULT_FROM_WIN32_ERROR_CANCELLED: i32 = -2147023673;

    unsafe {
        let init_hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let should_uninitialize = init_hr.is_ok();

        if !init_hr.is_ok() {
            return Err(format!("初始化文件选择器失败: {init_hr:?}"));
        }

        let result = (|| {
            let dialog: IFileOpenDialog =
                CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
                    .map_err(|error| format!("创建文件选择器失败: {error}"))?;

            let filters = [
                COMDLG_FILTERSPEC {
                    pszName: w!("m7-editor 工程文件"),
                    pszSpec: w!("*.json"),
                },
                COMDLG_FILTERSPEC {
                    pszName: w!("所有文件"),
                    pszSpec: w!("*.*"),
                },
            ];

            dialog
                .SetTitle(w!("选择工程文件"))
                .map_err(|error| format!("设置文件选择器标题失败: {error}"))?;
            dialog
                .SetFileTypes(&filters)
                .map_err(|error| format!("设置工程文件筛选器失败: {error}"))?;

            if let Err(error) = dialog.Show(None) {
                if error.code().0 == HRESULT_FROM_WIN32_ERROR_CANCELLED {
                    return Ok(None);
                }
                return Err(format!("打开文件选择器失败: {error}"));
            }

            let item = dialog
                .GetResult()
                .map_err(|error| format!("读取文件选择结果失败: {error}"))?;
            let display_name = item
                .GetDisplayName(SIGDN_FILESYSPATH)
                .map_err(|error| format!("读取文件路径失败: {error}"))?;
            let path_result = display_name
                .to_string()
                .map_err(|error| format!("转换文件路径失败: {error}"));

            CoTaskMemFree(Some(display_name.0 as _));

            let path = path_result?;
            Ok(Some(PathBuf::from(path)))
        })();

        if should_uninitialize {
            CoUninitialize();
        }

        result
    }
}

#[cfg(target_os = "macos")]
fn open_project_file_dialog() -> Result<Option<PathBuf>, String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSModalResponseOK, NSOpenPanel};
    use objc2_foundation::{NSArray, NSString};

    let Some(mtm) = MainThreadMarker::new() else {
        return Err("macOS 文件选择器必须在主线程调用".to_string());
    };

    let panel = NSOpenPanel::openPanel(mtm);
    panel.setCanChooseFiles(true);
    panel.setCanChooseDirectories(false);
    panel.setAllowsMultipleSelection(false);
    let title = NSString::from_str("选择工程文件");
    panel.setTitle(Some(&title));

    let extensions = ["json"];
    let ns_exts = extensions.map(NSString::from_str);
    let refs: Vec<&NSString> = ns_exts.iter().map(|ext| &**ext).collect();
    let allowed_types = NSArray::from_slice(&refs);

    #[allow(deprecated)]
    panel.setAllowedFileTypes(Some(&allowed_types));

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

#[cfg(not(any(windows, target_os = "macos")))]
fn open_project_file_dialog() -> Result<Option<PathBuf>, String> {
    Err("当前平台暂未实现后端工程文件选择器".to_string())
}

#[tauri::command]
fn open_project_file() -> Result<Option<Value>, String> {
    let Some(path) = open_project_file_dialog()? else {
        return Ok(None);
    };

    let project = read_json::<Value>(&path)
        .map_err(|error| format!("无法读取工程文件 {}: {error}", path.display()))?;
    Ok(Some(project))
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
    let clean_path = path_str.strip_prefix(r"\\?\").unwrap_or(&path_str);

    let mut from: Vec<u16> = std::ffi::OsStr::new(clean_path)
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

    if result != 0 {
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
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONQUESTION, MB_YESNOCANCEL};

    unsafe {
        MessageBoxW(
            None,
            w!("　　是否最小化到系统托盘？\n\n　　　　　　是：隐藏到托盘\n　　　　　　否：关闭应用\n　　　　　　取消：返回编辑器"),
            w!("关闭 m7-editor"),
            MB_YESNOCANCEL | MB_ICONQUESTION,
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

#[tauri::command]
async fn create_video_export_render_window(
    app: AppHandle,
    runtime: State<'_, VideoExportRuntime>,
    job_id: String,
    job: Value,
    width: u32,
    height: u32,
) -> Result<(), String> {
    if job_id.len() != 36 || !job_id.chars().all(|character| character.is_ascii_hexdigit() || character == '-') {
        return Err("视频导出任务标识无效".to_string());
    }
    if width < 16 || width > 7680 || height < 16 || height > 4320 || width % 2 != 0 || height % 2 != 0 {
        return Err("独立渲染窗口尺寸无效".to_string());
    }
    if app.get_webview_window(VIDEO_EXPORT_RENDER_WINDOW_LABEL).is_some() {
        return Err("已有视频导出渲染窗口正在运行".to_string());
    }

    runtime
        .render_jobs
        .lock()
        .map_err(|_| "视频导出任务状态不可用".to_string())?
        .insert(job_id.clone(), job);

    let url = format!("index.html?videoExportRender={job_id}");
    let window = WebviewWindowBuilder::new(
        &app,
        VIDEO_EXPORT_RENDER_WINDOW_LABEL,
        WebviewUrl::App(url.into()),
    )
    .inner_size(width as f64, height as f64)
    .min_inner_size(width as f64, height as f64)
    .max_inner_size(width as f64, height as f64)
    .decorations(false)
    .resizable(false)
    .skip_taskbar(true)
    .always_on_bottom(true)
    .focused(false)
    .visible(true)
    .build();

    if let Err(error) = window {
        if let Ok(mut jobs) = runtime.render_jobs.lock() {
            jobs.remove(&job_id);
        }
        return Err(format!("无法创建独立视频渲染窗口: {error}"));
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
fn finish_video_export_render_window(
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
        {
            if let Ok(mut processes) = runtime.ffmpeg_processes.lock() {
                if let Some(mut child) = processes.remove(output_path) {
                    drop(child.stdin.take());
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
            let _ = cancel_video_export_file(output_path.to_string());
        }
    }

    if let Some(window) = app.get_webview_window(VIDEO_EXPORT_RENDER_WINDOW_LABEL) {
        window
            .close()
            .map_err(|error| format!("关闭独立视频渲染窗口失败: {error}"))?;
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
                let webview = unsafe { Retained::retain(webview_pointer) };
                let callback = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
                    let result = if !error.is_null() {
                        Err("WKWebView 快照失败".to_string())
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
        let error_sender = sender.clone();
        let sender_pointer = Box::into_raw(Box::new(sender)) as usize;

        if let Err(error) = window.with_webview(move |platform_webview| {
            let webview = platform_webview.inner();
            let webview_pointer = webview.as_ptr().cast::<std::ffi::c_void>();
            unsafe {
                webkit_web_view_get_snapshot(
                    webview_pointer,
                    0,
                    0,
                    std::ptr::null_mut(),
                    Some(linux_snapshot_finished),
                    sender_pointer as *mut std::ffi::c_void,
                );
            }
        }) {
            let _ = error_sender.send(Err(format!("调度 WebKitGTK 快照失败: {error}")));
            unsafe { drop(Box::from_raw(sender_pointer as *mut mpsc::SyncSender<Result<Vec<u8>, String>>)) };
            return Err(format!("调度 WebKitGTK 快照失败: {error}"));
        }

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
    use objc2::runtime::AnyObject;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSBitmapImageRepPropertyKey};
    use objc2_foundation::NSDictionary;

    let tiff = image
        .TIFFRepresentation()
        .ok_or_else(|| "无法从 WKWebView 快照获取图像数据".to_string())?;
    let representation = NSBitmapImageRep::imageRepWithData(&tiff)
        .ok_or_else(|| "无法解码 WKWebView 快照".to_string())?;
    let properties: NSDictionary<NSBitmapImageRepPropertyKey, AnyObject> = NSDictionary::new();
    let png = representation
        .representationUsingType_properties(NSBitmapImageFileType::PNG, &properties)
        .ok_or_else(|| "无法将 WKWebView 快照编码为 PNG".to_string())?;
    let bytes = std::slice::from_raw_parts(png.bytes().cast::<u8>(), png.length()).to_vec();
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
    let buffer = &mut *closure.cast::<Vec<u8>>();
    buffer.extend_from_slice(std::slice::from_raw_parts(data, length as usize));
    0
}

#[cfg(windows)]
unsafe fn stream_to_bytes(
    stream: &windows::Win32::System::Com::IStream,
) -> Result<Vec<u8>, String> {
    use windows::Win32::System::Com::StructuredStorage::GetHGlobalFromStream;
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};

    let memory = GetHGlobalFromStream(stream)
        .map_err(|error| format!("读取截图缓冲区失败: {error}"))?;
    let size = GlobalSize(memory);
    if size == 0 {
        return Err("WebView2 返回了空截图".to_string());
    }

    let pointer = GlobalLock(memory);
    if pointer.is_null() {
        return Err("锁定截图缓冲区失败".to_string());
    }

    let bytes = std::slice::from_raw_parts(pointer.cast::<u8>(), size).to_vec();
    let _ = GlobalUnlock(memory);
    Ok(bytes)
}

#[cfg(windows)]
fn save_video_file_dialog() -> Result<Option<PathBuf>, String> {
    use windows::core::w;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{FileSaveDialog, IFileSaveDialog, SIGDN_FILESYSPATH};

    const HRESULT_FROM_WIN32_ERROR_CANCELLED: i32 = -2147023673;

    unsafe {
        let init_hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        if !init_hr.is_ok() {
            return Err(format!("初始化视频保存对话框失败: {init_hr:?}"));
        }

        let result = (|| {
            let dialog: IFileSaveDialog =
                CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER)
                    .map_err(|error| format!("创建视频保存对话框失败: {error}"))?;
            let filters = [COMDLG_FILTERSPEC {
                pszName: w!("MP4 视频"),
                pszSpec: w!("*.mp4"),
            }];
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
                .SetFileName(w!("m7-export.mp4"))
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
            let display_name = item
                .GetDisplayName(SIGDN_FILESYSPATH)
                .map_err(|error| format!("读取视频保存路径失败: {error}"))?;
            let path_result = display_name
                .to_string()
                .map_err(|error| format!("转换视频保存路径失败: {error}"));
            CoTaskMemFree(Some(display_name.0 as _));
            Ok(Some(PathBuf::from(path_result?)))
        })();

        CoUninitialize();
        result
    }
}

#[cfg(target_os = "macos")]
fn save_video_file_dialog() -> Result<Option<PathBuf>, String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSModalResponseOK, NSSavePanel};
    use objc2_foundation::NSString;

    let Some(mtm) = MainThreadMarker::new() else {
        return Err("macOS 视频保存对话框必须在主线程调用".to_string());
    };

    let panel = NSSavePanel::savePanel(mtm);
    let title = NSString::from_str("导出视频");
    panel.setTitle(Some(&title));
    let filename = NSString::from_str("m7-export.mp4");
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
fn save_video_file_dialog() -> Result<Option<PathBuf>, String> {
    let zenity = Command::new("zenity")
        .args([
            "--file-selection",
            "--save",
            "--confirm-overwrite",
            "--title=导出视频",
            "--filename=m7-export.mp4",
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
        .args(["--getsavefilename", "m7-export.mp4", "*.mp4|MP4 视频"])
        .output()
        .map_err(|error| format!("未找到 zenity/kdialog 文件对话框: {error}"))?;

    if !kdialog.status.success() {
        return Ok(None);
    }
    let path = String::from_utf8_lossy(&kdialog.stdout).trim().to_string();
    Ok((!path.is_empty()).then(|| PathBuf::from(path)))
}

#[tauri::command]
async fn choose_video_export_path(app: AppHandle) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    let selected = {
        let (sender, receiver) = mpsc::sync_channel(1);
        app.run_on_main_thread(move || {
            let _ = sender.send(save_video_file_dialog());
        })
        .map_err(|error| format!("调度 macOS 视频保存对话框失败: {error}"))?;

        tauri::async_runtime::spawn_blocking(move || {
            receiver.recv_timeout(Duration::from_secs(300))
        })
        .await
        .map_err(|error| format!("等待 macOS 视频保存对话框失败: {error}"))?
        .map_err(|error| format!("等待 macOS 视频保存对话框超时或失败: {error}"))?
    };

    #[cfg(not(target_os = "macos"))]
    let selected = {
        let _ = app;
        save_video_file_dialog()?
    };

    Ok(selected.map(|path| path.to_string_lossy().into_owned()))
}

fn validate_video_export_path(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if !path.is_absolute() {
        return Err("视频导出路径必须是绝对路径".to_string());
    }
    if path.extension().and_then(|value| value.to_str()).map(|value| value.to_ascii_lowercase()) != Some("mp4".to_string()) {
        return Err("视频导出文件必须使用 .mp4 扩展名".to_string());
    }
    Ok(path)
}

#[tauri::command]
fn start_video_export_file(path: String) -> Result<(), String> {
    let path = validate_video_export_path(&path)?;
    OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&path)
        .map_err(|error| format!("无法创建导出文件 {}: {error}", path.display()))?;
    Ok(())
}

#[tauri::command]
fn write_video_export_chunk(path: String, position: u64, data: Vec<u8>) -> Result<(), String> {
    let path = validate_video_export_path(&path)?;
    let mut file = OpenOptions::new()
        .write(true)
        .open(&path)
        .map_err(|error| format!("无法打开导出文件 {}: {error}", path.display()))?;
    file.seek(SeekFrom::Start(position))
        .and_then(|_| file.write_all(&data))
        .map_err(|error| format!("写入导出文件失败: {error}"))
}

#[tauri::command]
fn finish_video_export_file(path: String, file_size: u64) -> Result<(), String> {
    let path = validate_video_export_path(&path)?;
    let file = OpenOptions::new()
        .write(true)
        .open(&path)
        .map_err(|error| format!("无法最终化导出文件 {}: {error}", path.display()))?;
    file.set_len(file_size)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("最终化导出文件失败: {error}"))
}

#[tauri::command]
fn cancel_video_export_file(path: String) -> Result<(), String> {
    let path = validate_video_export_path(&path)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("删除未完成的导出文件失败: {error}")),
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
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command
}

#[tauri::command]
fn can_use_ffmpeg_video_encoder(app: AppHandle) -> bool {
    ffmpeg_has_encoder(&app, "libx264")
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

#[tauri::command]
fn start_ffmpeg_video_export(
    app: AppHandle,
    runtime: State<'_, VideoExportRuntime>,
    output_path: String,
    media_path: Option<String>,
    quality: String,
    fps: f64,
    start_ms: f64,
    end_ms: f64,
    frame_count: u64,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let output = validate_video_export_path(&output_path)?;
    let crf = match quality.as_str() {
        "low" => "32",
        "high" => "20",
        "very-high" => "16",
        "near-lossless" => "0",
        _ => return Err("FFmpeg 视频质量选项无效".to_string()),
    };
    let media = media_path.map(PathBuf::from);
    if let Some(media) = media.as_ref() {
        if !media.is_absolute() || !media.is_file() {
            return Err("FFmpeg 后备导出需要可访问的本地源视频文件".to_string());
        }
        if !ffmpeg_has_encoder(&app, "aac") {
            return Err("FFmpeg 缺少 AAC 编码器，无法封装源视频音轨".to_string());
        }
    }
    if !fps.is_finite()
        || fps <= 0.0
        || !start_ms.is_finite()
        || !end_ms.is_finite()
        || end_ms <= start_ms
        || frame_count == 0
        || width == 0
        || height == 0
    {
        return Err("FFmpeg 视频导出参数无效".to_string());
    }

    let duration_seconds = (end_ms - start_ms) / 1000.0;
    let mut process = ffmpeg_command(&app);
    process
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-y")
        .arg("-f")
        .arg("image2pipe")
        .arg("-vcodec")
        .arg("png")
        .arg("-framerate")
        .arg(fps.to_string())
        .arg("-i")
        .arg("pipe:0");
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
        .arg("medium")
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
        .stderr(Stdio::null());

    let child = process
        .spawn()
        .map_err(|error| format!("无法启动 FFmpeg 后备编码器: {error}"))?;
    let mut sessions = runtime
        .ffmpeg_processes
        .lock()
        .map_err(|_| "FFmpeg 导出会话状态不可用".to_string())?;
    if sessions.contains_key(&output_path) {
        let mut child = child;
        let _ = child.kill();
        let _ = child.wait();
        return Err("该目标文件已有正在运行的 FFmpeg 导出".to_string());
    }
    sessions.insert(output_path, child);
    Ok(())
}

#[tauri::command]
fn write_ffmpeg_video_frame(
    runtime: State<'_, VideoExportRuntime>,
    output_path: String,
    png_frame: Vec<u8>,
) -> Result<(), String> {
    let mut sessions = runtime
        .ffmpeg_processes
        .lock()
        .map_err(|_| "FFmpeg 导出会话状态不可用".to_string())?;
    let child = sessions
        .get_mut(&output_path)
        .ok_or_else(|| "FFmpeg 导出会话不存在".to_string())?;
    child
        .stdin
        .as_mut()
        .ok_or_else(|| "FFmpeg 视频帧输入已关闭".to_string())?
        .write_all(&png_frame)
        .map_err(|error| format!("向 FFmpeg 写入视频帧失败: {error}"))
}

#[tauri::command]
fn finish_ffmpeg_video_export(
    runtime: State<'_, VideoExportRuntime>,
    output_path: String,
) -> Result<(), String> {
    let mut child = runtime
        .ffmpeg_processes
        .lock()
        .map_err(|_| "FFmpeg 导出会话状态不可用".to_string())?
        .remove(&output_path)
        .ok_or_else(|| "FFmpeg 导出会话不存在".to_string())?;
    drop(child.stdin.take());
    let status = child
        .wait()
        .map_err(|error| format!("等待 FFmpeg 完成失败: {error}"))?;
    if !status.success() {
        return Err(format!("FFmpeg 编码失败，退出状态: {status}"));
    }

    let path = validate_video_export_path(&output_path)?;
    OpenOptions::new()
        .write(true)
        .open(&path)
        .and_then(|file| file.sync_all())
        .map_err(|error| format!("无法同步 FFmpeg 输出文件: {error}"))
}

#[tauri::command]
fn cancel_ffmpeg_video_export(
    runtime: State<'_, VideoExportRuntime>,
    output_path: String,
) -> Result<(), String> {
    if let Some(mut child) = runtime
        .ffmpeg_processes
        .lock()
        .map_err(|_| "FFmpeg 导出会话状态不可用".to_string())?
        .remove(&output_path)
    {
        drop(child.stdin.take());
        let _ = child.kill();
        let _ = child.wait();
    }

    cancel_video_export_file(output_path)
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
            });
            app.manage(VideoExportRuntime::default());
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
            append_log
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
