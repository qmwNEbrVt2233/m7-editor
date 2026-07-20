use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

#[cfg(desktop)]
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    WindowEvent,
};

const APP_VERSION: &str = "1.8.0";
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    version: String,
    projects: Vec<String>,
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

#[cfg(desktop)]
const MAIN_WINDOW_LABEL: &str = "main";

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

    fs::create_dir_all(&logs_dir).map_err(|error| format!("无法创建日志目录: {error}"))?;
    fs::create_dir_all(&projects_dir).map_err(|error| format!("无法创建默认工程目录: {error}"))?;

    Ok((data_dir, logs_dir, projects_dir))
}

fn default_app_config() -> AppConfig {
    AppConfig {
        version: APP_VERSION.to_string(),
        projects: Vec::new(),
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
    })
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
    fs::remove_dir_all(path).map_err(|error| format!("删除失败: {error}"))
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
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            register_media_file,
            open_media_file,
            get_file_system_state,
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
