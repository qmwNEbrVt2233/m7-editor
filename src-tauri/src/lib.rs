mod config;
#[cfg(desktop)]
mod desktop;
mod dialogs;
mod fs_utils;
mod mcp_bridge;
mod media;
mod presets;
mod projects;
mod templates;
mod video_export;

use std::sync::Mutex;

use tauri::Manager;

use crate::{
    config::{initialize_file_system, FileSystemRuntime},
    mcp_bridge::McpBridgeRuntime,
    video_export::VideoExportRuntime,
};

pub(crate) const APP_VERSION: &str = "1.12.0";
pub(crate) const MAIN_WINDOW_LABEL: &str = "main";

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
            "--force-color-profile=srgb --disable-features=UseSkiaRenderer --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding",
        );
    }

    let builder = tauri::Builder::default()
        .setup(|app| {
            let log_file = initialize_file_system(app.handle())?;
            app.manage(FileSystemRuntime {
                log_file: Mutex::new(Some(log_file)),
                config_lock: Mutex::new(()),
            });
            app.manage(VideoExportRuntime::default());
            let mcp_bridge = McpBridgeRuntime::start(app.handle().clone())
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            app.manage(mcp_bridge);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            video_export::render_window::create_video_export_render_window,
            video_export::render_window::get_video_export_render_job,
            video_export::render_window::finish_video_export_render_window,
            video_export::snapshot::capture_webview_snapshot,
            video_export::file::choose_video_export_path,
            video_export::file::prepare_video_export_path,
            video_export::file::start_video_export_file,
            video_export::file::write_video_export_chunk,
            video_export::file::finish_video_export_file,
            video_export::file::cancel_video_export_file,
            video_export::ffmpeg::can_use_ffmpeg_video_encoder,
            video_export::ffmpeg::start_ffmpeg_video_export,
            video_export::ffmpeg::write_ffmpeg_video_frame,
            video_export::ffmpeg::finish_ffmpeg_video_export,
            video_export::ffmpeg::cancel_ffmpeg_video_export,
            media::register_media_file,
            media::open_media_file,
            config::get_file_system_state,
            config::update_global_settings,
            templates::list_danmaku_templates,
            templates::create_danmaku_template,
            templates::update_danmaku_template,
            templates::rename_danmaku_template,
            templates::delete_danmaku_template,
            presets::list_creation_presets,
            presets::create_creation_preset,
            presets::update_creation_preset,
            presets::rename_creation_preset,
            presets::delete_creation_preset,
            projects::commands::check_folder_project_path,
            projects::commands::create_folder_project,
            projects::commands::load_folder_project,
            projects::commands::save_folder_project,
            projects::commands::backup_folder_project,
            projects::commands::update_folder_project_config,
            projects::commands::edit_folder_project,
            projects::commands::remove_folder_project,
            projects::commands::choose_project_folder,
            projects::commands::import_folder_project,
            projects::commands::open_project_file,
            projects::commands::read_project_json_file,
            projects::commands::read_xml_file,
            config::append_log,
            mcp_bridge::complete_mcp_request,
            mcp_bridge::set_mcp_frontend_ready,
            mcp_bridge::read_mcp_json_file,
            mcp_bridge::write_mcp_json_file
        ]);

    #[cfg(desktop)]
    let builder = desktop::configure_desktop_events(builder);

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(bridge) = app.try_state::<McpBridgeRuntime>() {
                bridge.shutdown();
            }
            if let Some(export_runtime) = app.try_state::<VideoExportRuntime>() {
                export_runtime.shutdown();
            }
        }

        #[cfg(desktop)]
        if matches!(event, tauri::RunEvent::Ready) {
            desktop::setup_tray_menu(app);
        }
    });
}
