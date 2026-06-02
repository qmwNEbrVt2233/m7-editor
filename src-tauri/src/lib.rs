use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
struct MediaFile {
    path: String,
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

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            register_media_file,
            open_media_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
