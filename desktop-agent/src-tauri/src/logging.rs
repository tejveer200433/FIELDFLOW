use std::{fs, io::Write};

use chrono::Utc;
use serde_json::json;
use tauri::{AppHandle, Manager};

const MAX_LOG_BYTES: u64 = 1_048_576;
const ALLOWED_EVENTS: &[&str] = &[
    "agent_started",
    "login_succeeded",
    "login_failed",
    "device_registered",
    "startup_sync_succeeded",
    "startup_sync_delayed",
    "tracking_started",
    "tracking_started_automatically",
    "tracking_resumed",
    "tracking_reconciled_stopped",
    "tracking_reconciled_resumed",
    "tracking_stopped",
    "session_reconciliation_delayed",
    "final_sample_failed",
    "sync_succeeded",
    "sync_delayed",
    "heartbeat_succeeded",
    "heartbeat_delayed",
    "logout_succeeded",
    "autostart_enabled",
    "autostart_enable_failed",
    "browser_bridge_start_failed",
    "update_installing",
    "update_check_current",
    "update_check_delayed",
    "update_restart_recovered",
];

pub fn write(app: &AppHandle, event: &str, level: &str, debug_enabled: bool) -> Result<(), String> {
    if !ALLOWED_EVENTS.contains(&event) {
        return Err("The requested log event is not allowed.".to_string());
    }
    if !matches!(level, "info" | "warn" | "error" | "debug") {
        return Err("The requested log level is not allowed.".to_string());
    }
    if level == "debug" && !debug_enabled {
        return Ok(());
    }
    let directory = app
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join("agent.jsonl");
    if path.metadata().map(|metadata| metadata.len()).unwrap_or(0) >= MAX_LOG_BYTES {
        let rotated = directory.join("agent.jsonl.1");
        if rotated.exists() {
            fs::remove_file(&rotated).map_err(|error| error.to_string())?;
        }
        fs::rename(&path, rotated).map_err(|error| error.to_string())?;
    }
    let record = json!({
        "timestamp": Utc::now().to_rfc3339(),
        "level": level,
        "event": event
    });
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    writeln!(file, "{record}").map_err(|error| error.to_string())
}
