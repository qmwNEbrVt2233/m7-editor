#![cfg(desktop)]

use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    AppHandle, Builder, Manager, WindowEvent,
};

use crate::MAIN_WINDOW_LABEL;

const TRAY_ID: &str = "main";
const TRAY_MENU_SHOW: &str = "tray-show";
const TRAY_MENU_HIDE: &str = "tray-hide";
const TRAY_MENU_QUIT: &str = "tray-quit";

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.show();
        if window.is_minimized().unwrap_or(false) {
            let _ = window.unminimize();
        }
        let _ = window.set_focus();
    }
}

fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.hide();
    }
}

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
fn ask_close_behavior() -> i32 {
    use windows::core::w;
    use windows::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, MB_ICONQUESTION, MB_SETFOREGROUND, MB_TOPMOST, MB_YESNOCANCEL,
    };

    unsafe {
        MessageBoxW(
            None,
            w!("　　是否最小化到系统托盘？\n\n　　　　　　是：隐藏到托盘\n　　　　　　否：关闭应用\n　　　　　　取消：返回编辑器"),
            w!("关闭 m7-editor"),
            MB_YESNOCANCEL | MB_ICONQUESTION | MB_TOPMOST | MB_SETFOREGROUND,
        )
        .0
    }
}

#[cfg(not(windows))]
fn ask_close_behavior() -> i32 {
    6
}

pub(crate) fn configure_desktop_events(builder: Builder<tauri::Wry>) -> Builder<tauri::Wry> {
    builder
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
        })
        .on_tray_icon_event(|app, event| match event {
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
        })
}

pub(crate) fn setup_tray_menu(app: &AppHandle) {
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
