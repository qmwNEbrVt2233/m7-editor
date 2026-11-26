use std::{
    fs,
    path::{Path, PathBuf},
};

use serde_json::{json, Value};
use tauri::AppHandle;

use crate::{
    config::add_project_to_app_config,
    fs_utils::{
        copy_file_safely, now_millis, paths_refer_to_same_entry, read_json,
        resolve_file_inside_dir, sanitize_file_name, validate_single_file_name, write_json,
    },
    media::{canonical_media_file, register_media_path},
    projects::{
        FolderProjectPayload, ProjectConfig, ProjectMediaConfig, ProjectSummary,
        PROJECT_CONFIG_FILE,
    },
    APP_VERSION,
};

pub(crate) fn validate_project_config_fields(config: &ProjectConfig) -> Result<(), String> {
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

pub(crate) fn load_project_config(project_dir: &Path) -> Result<ProjectConfig, String> {
    let config: ProjectConfig = read_json(&project_dir.join(PROJECT_CONFIG_FILE))?;
    validate_project_config_fields(&config)?;
    Ok(config)
}

pub(crate) fn save_project_config(
    project_dir: &Path,
    config: &ProjectConfig,
) -> Result<(), String> {
    validate_project_config_fields(config)?;
    write_json(&project_dir.join(PROJECT_CONFIG_FILE), config)
}

pub(crate) fn resolve_project_media_path(
    project_dir: &Path,
    config: &ProjectConfig,
) -> Option<PathBuf> {
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

pub(crate) fn media_config_from_path(
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

pub(crate) fn set_project_media_value(project: &mut Value, media_path: Option<&Path>) {
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

pub(crate) fn validate_project_json_value(project: &Value, label: &str) -> Result<(), String> {
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

pub(crate) fn read_validated_project_json(path: &Path) -> Result<Value, String> {
    let project = read_json::<Value>(path)
        .map_err(|error| format!("无法读取工程文件 {}: {error}", path.display()))?;
    validate_project_json_value(&project, &format!("工程文件 {}", path.display()))?;
    Ok(project)
}

pub(crate) fn build_folder_project_payload(
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

pub(crate) fn load_folder_project_payload(
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

pub(crate) fn project_summary(project_path: &Path) -> Result<ProjectSummary, String> {
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

pub(crate) fn save_folder_project_inner(
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

    config.version = APP_VERSION.to_string();
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
