use std::{
    fs,
    path::{Path, PathBuf},
};

use serde_json::{json, Value};
use tauri::AppHandle;

use crate::{
    config::{
        add_project_to_app_config, remove_project_from_app_config, replace_project_in_app_config,
    },
    dialogs::{open_project_file_dialog, open_project_folder_dialog, run_platform_dialog},
    fs_utils::{
        backup_timestamp, copy_file_safely, move_path_to_recycle_bin, next_temp_file_seq,
        now_millis, paths_refer_to_same_entry, read_text_file_bounded, resolve_file_inside_dir,
        sanitize_file_name, validate_absolute_dir_input, write_json, MAX_IMPORT_TEXT_BYTES,
    },
    media::canonical_media_file,
    projects::{
        store::{
            build_folder_project_payload, load_folder_project_payload, load_project_config,
            media_config_from_path, project_summary, read_validated_project_json,
            resolve_project_media_path, save_folder_project_inner, save_project_config,
            set_project_media_value, validate_project_config_fields, validate_project_json_value,
        },
        CreateFolderProjectRequest, EditFolderProjectRequest, FolderProjectPayload, ProjectConfig,
        ProjectMediaConfig, ProjectPathCheck, ProjectSummary, SaveFolderProjectRequest,
        UpdateFolderProjectConfigRequest, PROJECT_CONFIG_FILE,
    },
    APP_VERSION,
};

#[tauri::command]
pub(crate) fn check_folder_project_path(
    parent_dir: String,
    name: String,
) -> Result<ProjectPathCheck, String> {
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

#[tauri::command]
pub(crate) async fn create_folder_project(
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
            let (media, media_path) = match request.media_path.filter(|path| !path.trim().is_empty())
            {
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
            let project_file_path =
                resolve_file_inside_dir(&canonical_dir, &project_file, "工程文件")?;
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
pub(crate) async fn load_folder_project(
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
pub(crate) async fn save_folder_project(
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
pub(crate) async fn backup_folder_project(
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
            let seq = next_temp_file_seq();
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
pub(crate) async fn update_folder_project_config(
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
pub(crate) async fn edit_folder_project(
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
            let old_file_path =
                resolve_file_inside_dir(&project_dir, &old_project_file, "旧工程文件")?;
            let new_file_path =
                resolve_file_inside_dir(&project_dir, &new_project_file, "新工程文件")?;
            if old_file_path.is_file()
                && new_file_path.exists()
                && !paths_refer_to_same_entry(&old_file_path, &new_file_path)
            {
                return Err(format!(
                    "目标工程文件已存在: {}",
                    new_file_path.display()
                ));
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
pub(crate) async fn remove_folder_project(
    app: AppHandle,
    project_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let trimmed = project_path.trim();
        if trimmed.is_empty() {
            return Err("工程路径不能为空".to_string());
        }
        let project_dir = PathBuf::from(trimmed);
        if project_dir.exists() {
            if !project_dir.is_dir() || !project_dir.join(PROJECT_CONFIG_FILE).is_file() {
                return Err(
                    "目标路径不是有效的文件夹工程（缺少 project_config.json），已拒绝删除"
                        .to_string(),
                );
            }
            move_path_to_recycle_bin(&project_dir)?;
        }
        remove_project_from_app_config(&app, &project_dir)
    })
    .await
    .map_err(|error| format!("删除文件夹工程失败: {error}"))?
}

#[tauri::command]
pub(crate) async fn choose_project_folder(app: AppHandle) -> Result<Option<String>, String> {
    Ok(
        run_platform_dialog(&app, open_project_folder_dialog, "文件夹选择器")
            .await?
            .map(|path| path.to_string_lossy().into_owned()),
    )
}

#[tauri::command]
pub(crate) async fn import_folder_project(
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
        None => {
            match run_platform_dialog(&app, open_project_folder_dialog, "文件夹选择器").await? {
                Some(selected) => selected,
                None => return Ok(None),
            }
        }
    };

    tauri::async_runtime::spawn_blocking(move || {
        let payload = load_folder_project_payload(&app, &path)?;
        add_project_to_app_config(&app, Path::new(&payload.path))?;
        Ok(Some(payload))
    })
    .await
    .map_err(|error| format!("导入文件夹工程失败: {error}"))?
}

#[tauri::command]
pub(crate) async fn open_project_file(app: AppHandle) -> Result<Option<Value>, String> {
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
pub(crate) async fn read_project_json_file(path: String) -> Result<Value, String> {
    let trimmed = path.trim().to_string();
    if trimmed.is_empty() {
        return Err("工程文件路径不能为空".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || read_validated_project_json(Path::new(&trimmed)))
        .await
        .map_err(|error| format!("读取工程文件失败: {error}"))?
}

#[tauri::command]
pub(crate) async fn read_xml_file(path: String) -> Result<String, String> {
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
