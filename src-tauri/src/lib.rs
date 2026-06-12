use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

#[cfg(desktop)]
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    WindowEvent,
};

#[derive(Serialize)]
struct MediaFile {
    path: String,
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            register_media_file,
            open_media_file
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
                    let _ = window.hide();
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
