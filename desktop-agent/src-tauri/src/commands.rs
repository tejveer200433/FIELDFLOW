use tauri::{AppHandle, Manager, State};

use crate::{
    database::{self, Database},
    input, logging,
    models::{
        CodingContext, DeviceIdentity, InputActivityCounts, NewCodingSample, NewSample,
        PendingCodingSample, PendingSample, PendingScreenshotSample, PendingWebsiteSample,
        SyncResult,
    },
    platform, screenshot, secure_store,
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
pub fn set_input_collection_enabled(enabled: bool) -> Result<(), String> {
    input::set_collection_enabled(enabled)
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
pub fn get_coding_context() -> Result<Option<CodingContext>, String> {
    platform::active_coding_context()
}

#[tauri::command]
pub fn enqueue_coding_sample(
    database: State<'_, Database>,
    sample: NewCodingSample,
) -> Result<(), String> {
    database::enqueue_coding(&database, &sample)
}

#[tauri::command]
pub fn pending_coding_samples(
    database: State<'_, Database>,
    limit: u32,
) -> Result<Vec<PendingCodingSample>, String> {
    database::pending_codings(&database, limit)
}

#[tauri::command]
pub fn mark_coding_samples_uploading(
    database: State<'_, Database>,
    ids: Vec<String>,
) -> Result<(), String> {
    database::mark_coding_uploading(&database, &ids)
}

#[tauri::command]
pub fn release_coding_samples(
    database: State<'_, Database>,
    ids: Vec<String>,
    error: String,
    retry_after_seconds: Option<i64>,
) -> Result<(), String> {
    database::release_coding(&database, &ids, &error, retry_after_seconds)
}

#[tauri::command]
pub fn apply_coding_sync_result(
    database: State<'_, Database>,
    result: SyncResult,
) -> Result<(), String> {
    database::apply_coding_result(&database, &result)
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
pub fn pending_website_samples(
    database: State<'_, Database>,
    limit: u32,
) -> Result<Vec<PendingWebsiteSample>, String> {
    database::pending_websites(&database, limit)
}

#[tauri::command]
pub fn mark_samples_uploading(
    database: State<'_, Database>,
    ids: Vec<String>,
) -> Result<(), String> {
    database::mark_uploading(&database, &ids)
}

#[tauri::command]
pub fn mark_website_samples_uploading(
    database: State<'_, Database>,
    ids: Vec<String>,
) -> Result<(), String> {
    database::mark_websites_uploading(&database, &ids)
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
pub fn release_website_samples(
    database: State<'_, Database>,
    ids: Vec<String>,
    error: String,
    retry_after_seconds: Option<i64>,
) -> Result<(), String> {
    database::release_websites(&database, &ids, &error, retry_after_seconds)
}

#[tauri::command]
pub fn apply_sync_result(database: State<'_, Database>, result: SyncResult) -> Result<(), String> {
    database::apply_result(&database, &result)
}

#[tauri::command]
pub fn apply_website_sync_result(
    database: State<'_, Database>,
    result: SyncResult,
) -> Result<(), String> {
    database::apply_website_result(&database, &result)
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

#[tauri::command]
pub fn capture_screenshot(
    app: AppHandle,
    database: State<'_, Database>,
    session_id: String,
) -> Result<Option<PendingScreenshotSample>, String> {
    screenshot::capture_and_enqueue(&app, &database, &session_id)
}

#[tauri::command]
pub fn pending_screenshot_samples(
    database: State<'_, Database>,
    limit: u32,
) -> Result<Vec<PendingScreenshotSample>, String> {
    database::pending_screenshots(&database, limit)
}

#[tauri::command]
pub fn mark_screenshot_samples_uploading(
    database: State<'_, Database>,
    ids: Vec<String>,
) -> Result<(), String> {
    database::mark_screenshots_uploading(&database, &ids)
}

#[tauri::command]
pub fn release_screenshot_samples(
    database: State<'_, Database>,
    ids: Vec<String>,
    error: String,
    retry_after_seconds: Option<i64>,
) -> Result<(), String> {
    database::release_screenshots(&database, &ids, &error, retry_after_seconds)
}

#[tauri::command]
pub fn apply_screenshot_sync_result(
    database: State<'_, Database>,
    result: SyncResult,
) -> Result<(), String> {
    let file_paths = database::apply_screenshot_result(&database, &result)?;
    screenshot::delete_files(&file_paths);
    Ok(())
}

#[tauri::command]
pub fn read_screenshot_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
    Ok(hex::encode(bytes))
}
