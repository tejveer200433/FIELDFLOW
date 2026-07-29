mod commands;
mod database;
mod input;
mod logging;
mod models;
mod platform;
mod secure_store;

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

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

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            app.manage(
                database::Database::open(&data_dir.join("activity-queue.db"))
                    .map_err(std::io::Error::other)?,
            );
            if let Some(window) = app.get_webview_window("main") {
                let window_to_hide = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_to_hide.hide();
                    }
                });
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
            commands::get_screen_locked,
            commands::get_active_application,
            commands::get_device_identity,
            commands::enqueue_sample,
            commands::pending_samples,
            commands::mark_samples_uploading,
            commands::release_samples,
            commands::apply_sync_result,
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
