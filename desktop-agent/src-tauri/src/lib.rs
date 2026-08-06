mod browser_bridge;
mod commands;
mod database;
mod input;
mod logging;
mod models;
mod platform;
mod screenshot;
mod secure_store;

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use tauri_plugin_autostart::MacosLauncher;

fn tray_image() -> Image<'static> {
    let mut pixels = vec![0u8; 16 * 16 * 4];
    for y in 0..16 {
        for x in 0..16 {
            let index = (y * 16 + x) * 4;
            let inside = (3..13).contains(&x) && (2..14).contains(&y);
            pixels[index] = if inside { 37 } else { 0 };
            pixels[index + 1] = if inside { 99 } else { 0 };
            pixels[index + 2] = if inside { 235 } else { 0 };
            pixels[index + 3] = if inside { 255 } else { 0 };
        }
    }
    Image::new_owned(pixels, 16, 16)
}

/// The agent window is hidden (not destroyed) when the user closes it, so tracking can
/// continue from the tray. WebView2 is built on Chromium, which throttles JS timers
/// (`setInterval`) in hidden/occluded windows to save power -- this is unrelated to
/// whether the user's machine is otherwise busy, and left unchecked it can silently slow
/// or stop the heartbeat/sample/sync loops that App.jsx drives entirely via
/// `window.setInterval`, eventually causing the server to time out an otherwise-healthy
/// session. Disabling these three Chromium flags keeps this webview's timers running at
/// full rate regardless of window visibility.
#[cfg(windows)]
fn disable_background_timer_throttling() {
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding",
    );
}

pub fn run() {
    #[cfg(windows)]
    disable_background_timer_throttling();

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.iter().any(|argument| argument == "--minimized") {
                return;
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            app.manage(
                database::Database::open(&data_dir.join("activity-queue.db"))
                    .map_err(std::io::Error::other)?,
            );
            {
                let database = app.state::<database::Database>();
                if let Err(error) = screenshot::sweep_orphaned_files(app.handle(), &database) {
                    let _ = logging::write(app.handle(), "screenshot_sweep_failed", "warn", false);
                    let _ = error;
                }
            }
            if browser_bridge::start(app.handle().clone()).is_err() {
                let _ = logging::write(app.handle(), "browser_bridge_start_failed", "warn", false);
            }
            let _ = input::start_monitoring();
            if let Some(window) = app.get_webview_window("main") {
                let window_to_hide = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_to_hide.hide();
                    }
                });
                if std::env::args().any(|argument| argument == "--minimized") {
                    let _ = window.hide();
                }
            }

            let open = MenuItem::with_id(app, "open", "Open FieldFlow", true, None::<&str>)?;
            let status = MenuItem::with_id(
                app,
                "status",
                "Status: open agent for details",
                false,
                None::<&str>,
            )?;
            let start = MenuItem::with_id(app, "start", "Start tracking", true, None::<&str>)?;
            let stop = MenuItem::with_id(app, "stop", "Stop tracking", true, None::<&str>)?;
            let sync = MenuItem::with_id(app, "sync", "Sync now", true, None::<&str>)?;
            let sign_out = MenuItem::with_id(app, "sign-out", "Sign out", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[&open, &status, &start, &stop, &sync, &sign_out, &quit],
            )?;
            TrayIconBuilder::new()
                .icon(tray_image())
                .menu(&menu)
                .tooltip("FieldFlow Activity Agent")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "start" => {
                        let _ = app.emit("agent-start-requested", ());
                    }
                    "stop" => {
                        let _ = app.emit("agent-stop-requested", ());
                    }
                    "sync" => {
                        let _ = app.emit("agent-sync-requested", ());
                    }
                    "sign-out" => {
                        let _ = app.emit("agent-sign-out-requested", ());
                    }
                    "quit" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        let _ = app.emit("agent-quit-requested", ());
                    }
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::secure_write,
            commands::secure_read,
            commands::secure_delete,
            commands::get_idle_seconds,
            commands::take_input_activity_counts,
            commands::set_input_collection_enabled,
            commands::get_screen_locked,
            commands::get_active_application,
            commands::get_device_identity,
            commands::get_coding_context,
            commands::enqueue_sample,
            commands::pending_samples,
            commands::pending_website_samples,
            commands::mark_samples_uploading,
            commands::mark_website_samples_uploading,
            commands::release_samples,
            commands::release_website_samples,
            commands::apply_sync_result,
            commands::apply_website_sync_result,
            commands::enqueue_coding_sample,
            commands::pending_coding_samples,
            commands::mark_coding_samples_uploading,
            commands::release_coding_samples,
            commands::apply_coding_sync_result,
            commands::capture_screenshot,
            commands::pending_screenshot_samples,
            commands::mark_screenshot_samples_uploading,
            commands::release_screenshot_samples,
            commands::apply_screenshot_sync_result,
            commands::read_screenshot_file,
            commands::recover_uploading_samples,
            commands::pending_sample_count,
            commands::set_agent_state,
            commands::get_agent_state,
            commands::quit_agent,
            commands::show_agent,
            commands::agent_log
        ])
        .run(tauri::generate_context!())
        .expect("FieldFlow Activity Agent failed to start");
}

#[cfg(all(test, windows))]
mod tests {
    use super::disable_background_timer_throttling;

    #[test]
    fn background_timer_throttling_is_disabled_for_webview2() {
        disable_background_timer_throttling();
        let value = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap();
        assert!(value.contains("--disable-background-timer-throttling"));
        assert!(value.contains("--disable-backgrounding-occluded-windows"));
        assert!(value.contains("--disable-renderer-backgrounding"));
    }
}
