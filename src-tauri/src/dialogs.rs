use std::path::PathBuf;
#[cfg(not(any(windows, target_os = "macos")))]
use std::process::Command;
#[cfg(target_os = "macos")]
use std::{sync::mpsc, time::Duration};
#[cfg(windows)]
use std::thread;

use tauri::AppHandle;

#[cfg(windows)]
fn run_windows_sta_dialog<T: Send + 'static>(
    operation: impl FnOnce() -> Result<Option<T>, String> + Send + 'static,
) -> Result<Option<T>, String> {
    let handle = thread::Builder::new()
        .name("m7-win-dialog".to_string())
        .spawn(operation)
        .map_err(|error| format!("无法启动系统对话框线程: {error}"))?;
    match handle.join() {
        Ok(result) => result,
        Err(_) => Err("系统对话框线程意外中止".to_string()),
    }
}

#[cfg(windows)]
struct WinComGuard;

#[cfg(windows)]
impl Drop for WinComGuard {
    fn drop(&mut self) {
        unsafe {
            windows::Win32::System::Com::CoUninitialize();
        }
    }
}

#[cfg(windows)]
struct WinCoTaskMemGuard(*mut std::ffi::c_void);

#[cfg(windows)]
impl Drop for WinCoTaskMemGuard {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                windows::Win32::System::Com::CoTaskMemFree(Some(self.0));
            }
        }
    }
}

#[cfg(windows)]
unsafe fn read_win_shell_item_path(
    item: &windows::Win32::UI::Shell::IShellItem,
) -> Result<PathBuf, String> {
    use windows::Win32::UI::Shell::SIGDN_FILESYSPATH;

    let display_name = item
        .GetDisplayName(SIGDN_FILESYSPATH)
        .map_err(|error| format!("读取文件路径失败: {error}"))?;
    let _guard = WinCoTaskMemGuard(display_name.0.cast());
    if display_name.0.is_null() {
        return Err("系统对话框返回了空路径".to_string());
    }
    let path = display_name
        .to_string()
        .map_err(|error| format!("转换文件路径失败: {error}"))?;
    if path.trim().is_empty() {
        return Err("系统对话框返回了空路径".to_string());
    }
    Ok(PathBuf::from(path))
}

#[cfg(windows)]
fn open_windows_file_dialog(
    title: &'static str,
    filters: &'static [(&'static str, &'static str)],
    pick_folders: bool,
) -> Result<Option<PathBuf>, String> {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{FileOpenDialog, IFileOpenDialog, FOS_PICKFOLDERS};

    const HRESULT_FROM_WIN32_ERROR_CANCELLED: i32 = -2147023673;

    run_windows_sta_dialog(move || unsafe {
        let init_hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        if !init_hr.is_ok() {
            return Err(format!("初始化系统选择器失败: {init_hr:?}"));
        }
        let _com = WinComGuard;

        let dialog: IFileOpenDialog =
            CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
                .map_err(|error| format!("创建系统选择器失败: {error}"))?;

        if pick_folders {
            dialog
                .SetOptions(FOS_PICKFOLDERS)
                .map_err(|error| format!("设置文件夹选择器失败: {error}"))?;
        }
        let title_h = HSTRING::from(title);
        dialog
            .SetTitle(&title_h)
            .map_err(|error| format!("设置选择器标题失败: {error}"))?;
        if !filters.is_empty() {
            let owned_filters: Vec<(HSTRING, HSTRING)> = filters
                .iter()
                .map(|(name, spec)| (HSTRING::from(*name), HSTRING::from(*spec)))
                .collect();
            let filter_specs: Vec<COMDLG_FILTERSPEC> = owned_filters
                .iter()
                .map(|(name, spec)| COMDLG_FILTERSPEC {
                    pszName: PCWSTR(name.as_ptr()),
                    pszSpec: PCWSTR(spec.as_ptr()),
                })
                .collect();
            dialog
                .SetFileTypes(&filter_specs)
                .map_err(|error| format!("设置文件筛选器失败: {error}"))?;
        }

        if let Err(error) = dialog.Show(None) {
            if error.code().0 == HRESULT_FROM_WIN32_ERROR_CANCELLED {
                return Ok(None);
            }
            return Err(format!("打开系统选择器失败: {error}"));
        }

        let item = dialog
            .GetResult()
            .map_err(|error| format!("读取选择结果失败: {error}"))?;
        read_win_shell_item_path(&item).map(Some)
    })
}

#[cfg(target_os = "macos")]
fn open_macos_panel(
    title_str: &str,
    choose_files: bool,
    choose_dirs: bool,
    extensions: &[&str],
) -> Result<Option<PathBuf>, String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSModalResponseOK, NSOpenPanel};
    use objc2_foundation::{NSArray, NSString};

    let Some(mtm) = MainThreadMarker::new() else {
        return Err("macOS 选择器必须在主线程调用".to_string());
    };

    let panel = NSOpenPanel::openPanel(mtm);
    panel.setCanChooseFiles(choose_files);
    panel.setCanChooseDirectories(choose_dirs);
    panel.setAllowsMultipleSelection(false);

    let title = NSString::from_str(title_str);
    panel.setTitle(Some(&title));

    if !extensions.is_empty() {
        let ns_exts: Vec<_> = extensions.iter().map(|ext| NSString::from_str(ext)).collect();
        let refs: Vec<&NSString> = ns_exts.iter().map(|extension| &**extension).collect();
        let allowed_types = NSArray::from_slice(&refs);
        #[allow(deprecated)]
        panel.setAllowedFileTypes(Some(&allowed_types));
    }

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

#[cfg(windows)]
pub(crate) fn open_media_file_dialog() -> Result<Option<PathBuf>, String> {
    open_windows_file_dialog(
        "选择媒体文件",
        &[
            (
                "媒体文件",
                "*.mp4;*.mov;*.mkv;*.avi;*.webm;*.flv;*.wmv;*.mp3;*.wav;*.flac;*.aac;*.m4a;*.ogg",
            ),
            ("所有文件", "*.*"),
        ],
        false,
    )
}

#[cfg(target_os = "macos")]
pub(crate) fn open_media_file_dialog() -> Result<Option<PathBuf>, String> {
    open_macos_panel(
        "选择媒体文件",
        true,
        false,
        &[
            "mp4", "mov", "mkv", "avi", "webm", "flv", "wmv", "mp3", "wav", "flac", "aac", "m4a",
            "ogg",
        ],
    )
}

#[cfg(not(any(windows, target_os = "macos")))]
pub(crate) fn open_media_file_dialog() -> Result<Option<PathBuf>, String> {
    Err("当前平台暂未实现后端媒体文件选择器".to_string())
}

#[cfg(windows)]
pub(crate) fn open_project_folder_dialog() -> Result<Option<PathBuf>, String> {
    open_windows_file_dialog("选择工程文件夹", &[], true)
}

#[cfg(target_os = "macos")]
pub(crate) fn open_project_folder_dialog() -> Result<Option<PathBuf>, String> {
    open_macos_panel("选择工程文件夹", false, true, &[])
}

#[cfg(not(any(windows, target_os = "macos")))]
pub(crate) fn open_project_folder_dialog() -> Result<Option<PathBuf>, String> {
    Err("当前平台暂未实现后端文件夹选择器".to_string())
}

#[cfg(windows)]
pub(crate) fn open_project_file_dialog() -> Result<Option<PathBuf>, String> {
    open_windows_file_dialog(
        "选择工程文件",
        &[("m7-editor 工程文件", "*.json"), ("所有文件", "*.*")],
        false,
    )
}

#[cfg(target_os = "macos")]
pub(crate) fn open_project_file_dialog() -> Result<Option<PathBuf>, String> {
    open_macos_panel("选择工程文件", true, false, &["json"])
}

#[cfg(not(any(windows, target_os = "macos")))]
pub(crate) fn open_project_file_dialog() -> Result<Option<PathBuf>, String> {
    Err("当前平台暂未实现后端工程文件选择器".to_string())
}

#[cfg(windows)]
pub(crate) fn save_video_file_dialog(default_file_name: &str) -> Result<Option<PathBuf>, String> {
    use windows::core::{w, HSTRING};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{FileSaveDialog, IFileSaveDialog};

    const HRESULT_FROM_WIN32_ERROR_CANCELLED: i32 = -2147023673;
    let default_name_owned = default_file_name.to_string();

    run_windows_sta_dialog(move || unsafe {
        let init_hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        if !init_hr.is_ok() {
            return Err(format!("初始化视频保存对话框失败: {init_hr:?}"));
        }
        let _com = WinComGuard;

        let dialog: IFileSaveDialog =
            CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER)
                .map_err(|error| format!("创建视频保存对话框失败: {error}"))?;
        let filters = [COMDLG_FILTERSPEC {
            pszName: w!("MP4 视频"),
            pszSpec: w!("*.mp4"),
        }];
        let default_name = HSTRING::from(&default_name_owned);
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
            .SetFileName(&default_name)
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
        read_win_shell_item_path(&item).map(Some)
    })
}

#[cfg(target_os = "macos")]
pub(crate) fn save_video_file_dialog(default_file_name: &str) -> Result<Option<PathBuf>, String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSModalResponseOK, NSSavePanel};
    use objc2_foundation::NSString;

    let Some(mtm) = MainThreadMarker::new() else {
        return Err("macOS 视频保存对话框必须在主线程调用".to_string());
    };

    let panel = NSSavePanel::savePanel(mtm);
    let title = NSString::from_str("导出视频");
    panel.setTitle(Some(&title));
    let filename = NSString::from_str(default_file_name);
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
pub(crate) fn save_video_file_dialog(default_file_name: &str) -> Result<Option<PathBuf>, String> {
    let zenity_filename = format!("--filename={default_file_name}");
    let zenity = Command::new("zenity")
        .args([
            "--file-selection",
            "--save",
            "--confirm-overwrite",
            "--title=导出视频",
            &zenity_filename,
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
        .args(["--getsavefilename", default_file_name, "*.mp4|MP4 视频"])
        .output()
        .map_err(|error| format!("未找到 zenity/kdialog 文件对话框: {error}"))?;

    if !kdialog.status.success() {
        return Ok(None);
    }
    let path = String::from_utf8_lossy(&kdialog.stdout).trim().to_string();
    Ok((!path.is_empty()).then(|| PathBuf::from(path)))
}

pub(crate) async fn run_platform_dialog(
    app: &AppHandle,
    dialog_fn: impl FnOnce() -> Result<Option<PathBuf>, String> + Send + 'static,
    label: &str,
) -> Result<Option<PathBuf>, String> {
    #[cfg(target_os = "macos")]
    {
        let (sender, receiver) = mpsc::sync_channel(1);
        app.run_on_main_thread(move || {
            let _ = sender.send(dialog_fn());
        })
        .map_err(|error| format!("调度 macOS {label}失败: {error}"))?;

        let dialog_result: Result<Option<PathBuf>, String> =
            tauri::async_runtime::spawn_blocking(move || {
                receiver.recv_timeout(Duration::from_secs(300))
            })
            .await
            .map_err(|error| format!("等待 macOS {label}失败: {error}"))?
            .map_err(|error| format!("等待 macOS {label}超时或失败: {error}"))?;
        dialog_result
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        tauri::async_runtime::spawn_blocking(dialog_fn)
            .await
            .map_err(|error| format!("等待{label}失败: {error}"))?
    }
}
