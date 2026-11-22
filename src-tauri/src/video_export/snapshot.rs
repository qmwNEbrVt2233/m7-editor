#[cfg(any(windows, target_os = "macos", target_os = "linux"))]
use std::{sync::mpsc, time::Duration};

use tauri::{ipc::Response, WebviewWindow};

#[tauri::command]
pub(crate) async fn capture_webview_snapshot(window: WebviewWindow) -> Result<Response, String> {
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
                let start_result = (|| -> Result<(), String> {
                    unsafe {
                        let core_webview = platform_webview
                            .controller()
                            .CoreWebView2()
                            .map_err(|error| format!("读取 WebView2 实例失败: {error}"))?;
                        let stream = CreateStreamOnHGlobal(HGLOBAL::default(), true)
                            .map_err(|error| format!("创建截图缓冲区失败: {error}"))?;
                        let callback_stream = stream.clone();
                        let handler = CapturePreviewCompletedHandler::create(Box::new(
                            move |status| {
                                let result = status
                                    .map_err(|error| format!("WebView2 截图失败: {error}"))
                                    .and_then(|_| stream_to_bytes(&callback_stream));
                                let _ = callback_sender.send(result);
                                Ok(())
                            },
                        ));

                        core_webview
                            .CapturePreview(
                                COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
                                &stream,
                                &handler,
                            )
                            .map_err(|error| format!("启动 WebView2 截图失败: {error}"))
                    }
                })();

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
                let Some(webview_pointer) =
                    NonNull::new(platform_webview.inner().cast::<WKWebView>())
                else {
                    let _ = error_sender.send(Err("WKWebView 实例不可用".to_string()));
                    return;
                };
                let Some(webview) = (unsafe { Retained::retain(webview_pointer.as_ptr()) }) else {
                    let _ = error_sender.send(Err("无法保留 WKWebView 实例".to_string()));
                    return;
                };
                let callback = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
                    let result = if !error.is_null() {
                        let desc = unsafe { (*error).localizedDescription().to_string() };
                        Err(format!("WKWebView 快照失败: {desc}"))
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
        let callback_sender = sender;

        window
            .with_webview(move |platform_webview| {
                let webview = platform_webview.inner();
                let webview_pointer = webview.as_ptr().cast::<std::ffi::c_void>();
                if webview_pointer.is_null() {
                    let _ = callback_sender.send(Err("WebKitGTK 实例不可用".to_string()));
                    return;
                }
                let sender_pointer =
                    Box::into_raw(Box::new(callback_sender)).cast::<std::ffi::c_void>();
                unsafe {
                    webkit_web_view_get_snapshot(
                        webview_pointer,
                        0,
                        0,
                        std::ptr::null_mut(),
                        Some(linux_snapshot_finished),
                        sender_pointer,
                    );
                }
            })
            .map_err(|error| format!("调度 WebKitGTK 快照失败: {error}"))?;

        let bytes = await_webview_snapshot(receiver).await?;
        return Ok(Response::new(bytes));
    }

    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        let _ = window;
        Err("当前平台尚未实现 WebView 合成截图适配器".to_string())
    }
}

#[cfg(any(windows, target_os = "macos", target_os = "linux"))]
async fn await_webview_snapshot(
    receiver: mpsc::Receiver<Result<Vec<u8>, String>>,
) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(20)))
        .await
        .map_err(|error| format!("等待 WebView 截图失败: {error}"))?
        .map_err(|error| format!("等待 WebView 截图超时或失败: {error}"))?
}

#[cfg(target_os = "macos")]
unsafe fn ns_image_to_png(image: &objc2_app_kit::NSImage) -> Result<Vec<u8>, String> {
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep};
    use objc2_foundation::NSDictionary;
    use std::ptr::NonNull;

    let tiff = image
        .TIFFRepresentation()
        .ok_or_else(|| "无法从 WKWebView 快照获取图像数据".to_string())?;
    let representation = NSBitmapImageRep::imageRepWithData(&tiff)
        .ok_or_else(|| "无法解码 WKWebView 快照".to_string())?;
    let properties = NSDictionary::new();
    let png = representation
        .representationUsingType_properties(NSBitmapImageFileType::PNG, &properties)
        .ok_or_else(|| "无法将 WKWebView 快照编码为 PNG".to_string())?;
    let length = png.length();
    if length == 0 {
        return Err("WKWebView 返回了空 PNG 数据".to_string());
    }
    let mut bytes = vec![0_u8; length];
    let buffer = NonNull::new(bytes.as_mut_ptr().cast())
        .ok_or_else(|| "无法分配 WKWebView 快照缓冲区".to_string())?;
    png.getBytes_length(buffer, length);
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
        callback: Option<
            unsafe extern "C" fn(
                *mut std::ffi::c_void,
                *mut std::ffi::c_void,
                *mut std::ffi::c_void,
            ),
        >,
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
    } else if png.is_empty() {
        let _ = sender.send(Err("WebKitGTK 返回了空 PNG 数据".to_string()));
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
    if length > 0 {
        if data.is_null() {
            return 11; // CAIRO_STATUS_WRITE_ERROR
        }
        let buffer = &mut *closure.cast::<Vec<u8>>();
        buffer.extend_from_slice(std::slice::from_raw_parts(data, length as usize));
    }
    0
}

#[cfg(windows)]
unsafe fn stream_to_bytes(
    stream: &windows::Win32::System::Com::IStream,
) -> Result<Vec<u8>, String> {
    use windows::Win32::System::Com::StructuredStorage::GetHGlobalFromStream;
    use windows::Win32::System::Com::{STATFLAG_NONAME, STATSTG};
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};

    let mut stat = STATSTG::default();
    stream
        .Stat(&mut stat, STATFLAG_NONAME)
        .map_err(|error| format!("读取截图流大小失败: {error}"))?;
    let stream_size = usize::try_from(stat.cbSize)
        .map_err(|_| "WebView2 截图大小超出内存限制".to_string())?;
    if stream_size == 0 {
        return Err("WebView2 返回了空截图".to_string());
    }

    let memory = GetHGlobalFromStream(stream)
        .map_err(|error| format!("读取截图缓冲区失败: {error}"))?;
    let alloc_size = GlobalSize(memory);
    if alloc_size == 0 || stream_size > alloc_size {
        return Err("WebView2 截图缓冲区大小无效".to_string());
    }

    let pointer = GlobalLock(memory);
    if pointer.is_null() {
        return Err("锁定截图缓冲区失败".to_string());
    }

    let bytes = std::slice::from_raw_parts(pointer.cast::<u8>(), stream_size).to_vec();
    let _ = GlobalUnlock(memory);
    Ok(bytes)
}
