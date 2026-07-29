use tauri::{AppHandle, Manager, State};

use crate::{
    database::{self, Database},
    input, logging,
    models::{DeviceIdentity, InputActivityCounts, NewSample, PendingSample, SyncResult},
    platform, secure_store,
};

#[tauri::command]
pub fn secure_write(key: String, value: String) -> Result<(), String> {
    secure_store::write(&key, &value)
}

#[tauri::command]
pub fn secure_read(key: String) -> Result<Option<String>, String> {
    secure_store::read(&key)
}

#[tauri::command]
pub fn secure_delete(key: String) -> Result<(), String> {
    secure_store::delete(&key)
}

#[tauri::command]
pub fn get_idle_seconds() -> Result<u64, String> {
    platform::idle_seconds()
}

#[tauri::command]
pub fn take_input_activity_counts() -> InputActivityCounts {
    input::take_counts()
}

#[tauri::command]
pub fn get_screen_locked() -> Result<bool, String> {
    platform::screen_locked()
}

#[tauri::command]
pub fn get_active_application() -> Result<Option<String>, String> {
    platform::active_application()
}

#[tauri::command]
pub fn get_device_identity() -> Result<DeviceIdentity, String> {
    platform::device_identity()
}

#[tauri::command]
pub fn enqueue_sample(database: State<'_, Database>, sample: NewSample) -> Result<(), String> {
    database::enqueue(&database, &sample)
}

#[tauri::command]
pub fn pending_samples(
    database: State<'_, Database>,
    limit: u32,
) -> Result<Vec<PendingSample>, String> {
    database::pending(&database, limit)
}

#[tauri::command]
pub fn mark_samples_uploading(
    database: State<'_, Database>,
    ids: Vec<String>,
) -> Result<(), String> {
    database::mark_uploading(&database, &ids)
}

#[tauri::command]
pub fn release_samples(
    database: State<'_, Database>,
    ids: Vec<String>,
    error: String,
    retry_after_seconds: Option<i64>,
) -> Result<(), String> {
    database::release(&database, &ids, &error, retry_after_seconds)
}

#[tauri::command]
pub fn apply_sync_result(database: State<'_, Database>, result: SyncResult) -> Result<(), String> {
    database::apply_result(&database, &result)
}

#[tauri::command]
pub fn recover_uploading_samples(database: State<'_, Database>) -> Result<(), String> {
    database::recover(&database)
}

#[tauri::command]
pub fn pending_sample_count(database: State<'_, Database>) -> Result<i64, String> {
    database::count(&database)
}

#[tauri::command]
pub fn set_agent_state(
    database: State<'_, Database>,
    key: String,
    value: String,
) -> Result<(), String> {
    database::set_state(&database, &key, &value)
}

#[tauri::command]
pub fn get_agent_state(
    database: State<'_, Database>,
    key: String,
) -> Result<Option<String>, String> {
    database::get_state(&database, &key)
}

#[tauri::command]
pub fn quit_agent(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn show_agent(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Agent window is not available.".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn agent_log(
    app: AppHandle,
    event: String,
    level: String,
    debug_enabled: bool,
) -> Result<(), String> {
    logging::write(&app, &event, &level, debug_enabled)
}
