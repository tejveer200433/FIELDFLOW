use std::fs;

use tauri::{AppHandle, Manager};

use crate::database::{self, Database};
use crate::models::{NewScreenshotSample, PendingScreenshotSample};
use crate::platform;

const MAX_PENDING_SCREENSHOTS: i64 = 300;
const MAX_ENCODED_WIDTH: u32 = 1600;
const JPEG_QUALITY: u8 = 70;
const MAX_ENCODED_BYTES: usize = 8_388_608;

/// Case-insensitive, exact-name match against the policy's exclude list. A pure function so
/// it's directly unit-testable without a display or the real capture API.
pub fn is_excluded_application(app: &str, excluded: &[String]) -> bool {
    let normalized = app.trim().to_lowercase();
    !normalized.is_empty()
        && excluded
            .iter()
            .any(|entry| entry.trim().to_lowercase() == normalized)
}

fn excluded_apps(database: &Database) -> Vec<String> {
    database::get_state(database, "screenshot_excluded_apps_json")
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default()
}

fn screenshots_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("screenshots");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

/// Captures the primary monitor, downscales/encodes to JPEG, writes it to disk, and enqueues
/// its metadata locally. The exclude-list check and the capture itself live in this single
/// function so nothing can invoke the underlying capture API without also going through the
/// check first. Returns `Ok(None)` when the foreground application is excluded -- no monitor
/// is ever enumerated or captured in that case.
pub fn capture_and_enqueue(
    app: &AppHandle,
    database: &Database,
    session_id: &str,
) -> Result<Option<PendingScreenshotSample>, String> {
    let active_application = platform::active_application()?;
    if let Some(current) = &active_application {
        if is_excluded_application(current, &excluded_apps(database)) {
            return Ok(None);
        }
    }

    if database::pending_screenshot_count(database)? >= MAX_PENDING_SCREENSHOTS {
        return Err(
            "The local screenshot queue is full. Screenshot capture was paused.".to_string(),
        );
    }

    let monitors = xcap::Monitor::all().map_err(|error| error.to_string())?;
    let monitor = monitors
        .iter()
        .find(|monitor| monitor.is_primary().unwrap_or(false))
        .or_else(|| monitors.first())
        .ok_or_else(|| "No monitor is available to capture.".to_string())?;
    let image = monitor
        .capture_image()
        .map_err(|error| error.to_string())?;

    let width = image.width();
    let resized = if width > MAX_ENCODED_WIDTH {
        let ratio = f64::from(MAX_ENCODED_WIDTH) / f64::from(width);
        let height = (f64::from(image.height()) * ratio).round() as u32;
        image::imageops::resize(
            &image,
            MAX_ENCODED_WIDTH,
            height,
            image::imageops::FilterType::Triangle,
        )
    } else {
        image
    };

    let mut encoded = Vec::new();
    {
        let mut encoder =
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut encoded, JPEG_QUALITY);
        encoder
            .encode_image(&resized)
            .map_err(|error| error.to_string())?;
    }
    if encoded.is_empty() || encoded.len() > MAX_ENCODED_BYTES {
        return Err("Captured screenshot has an invalid size.".to_string());
    }

    let local_sample_id = uuid::Uuid::new_v4().to_string();
    let file_path = screenshots_dir(app)?.join(format!("{local_sample_id}.jpg"));
    fs::write(&file_path, &encoded).map_err(|error| error.to_string())?;

    let sample = NewScreenshotSample {
        local_sample_id,
        tracking_session_id: session_id.to_string(),
        captured_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        file_path: file_path.to_string_lossy().into_owned(),
        active_application,
        byte_size: encoded.len() as i64,
    };
    database::enqueue_screenshot(database, &sample)?;

    Ok(Some(PendingScreenshotSample {
        local_sample_id: sample.local_sample_id,
        tracking_session_id: sample.tracking_session_id,
        captured_at: sample.captured_at,
        file_path: sample.file_path,
        active_application: sample.active_application,
        byte_size: sample.byte_size,
    }))
}

/// Best-effort local file cleanup -- a missing/already-deleted file is not an error. Must
/// only be called after the database lock used to look up these paths has been released.
pub fn delete_files(paths: &[String]) {
    for path in paths {
        let _ = fs::remove_file(path);
    }
}

/// Deletes any screenshot file on disk older than 24h that the local queue no longer
/// references at all -- covers a crash between writing the file and inserting its DB row.
/// Never deletes a file the queue still knows about, regardless of age.
pub fn sweep_orphaned_files(app: &AppHandle, database: &Database) -> Result<(), String> {
    let dir = screenshots_dir(app)?;
    let known: std::collections::HashSet<String> = database::all_screenshot_file_paths(database)?
        .into_iter()
        .collect();
    let cutoff = std::time::SystemTime::now()
        .checked_sub(std::time::Duration::from_secs(24 * 60 * 60))
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
    let entries = fs::read_dir(&dir).map_err(|error| error.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if known.contains(&path.to_string_lossy().into_owned()) {
            continue;
        }
        let is_old = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .map(|modified| modified <= cutoff)
            .unwrap_or(false);
        if is_old {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_excluded_application;

    #[test]
    fn exclude_match_is_case_insensitive_and_exact() {
        let excluded = vec!["1Password".to_string(), "banking-app".to_string()];
        assert!(is_excluded_application("1password", &excluded));
        assert!(is_excluded_application("BANKING-APP", &excluded));
        assert!(!is_excluded_application("code", &excluded));
        assert!(!is_excluded_application("", &excluded));
    }

    #[test]
    fn empty_exclude_list_excludes_nothing() {
        assert!(!is_excluded_application("anything", &[]));
    }

    #[test]
    #[ignore = "requires a live display; run manually with `cargo test -- --ignored screenshot_capture_round_trips_through_hex`"]
    fn screenshot_capture_round_trips_through_hex() {
        let monitors = xcap::Monitor::all().expect("no monitors available");
        let monitor = monitors
            .iter()
            .find(|monitor| monitor.is_primary().unwrap_or(false))
            .or_else(|| monitors.first())
            .expect("no monitor found");
        let image = monitor.capture_image().expect("capture failed");
        let mut encoded = Vec::new();
        {
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut encoded, 70);
            encoder.encode_image(&image).expect("encode failed");
        }
        assert!(encoded.len() > 100, "encoded JPEG suspiciously small: {} bytes", encoded.len());
        assert_eq!(&encoded[0..3], [0xFF, 0xD8, 0xFF], "missing JPEG SOI marker");
        assert_eq!(&encoded[encoded.len() - 2..], [0xFF, 0xD9], "missing JPEG EOI marker");

        let hex = hex::encode(&encoded);
        let dir = "C:/Users/HP/AppData/Local/Temp/claude/c--Users-HP-Downloads-fieldflow-nextjs/fab3d3cf-a40b-455e-964f-7c55794a6433/scratchpad";
        std::fs::write(format!("{dir}/roundtrip_original.jpg"), &encoded).expect("write jpg failed");
        std::fs::write(format!("{dir}/roundtrip.hex"), &hex).expect("write hex failed");
        println!("encoded {} bytes -> {} hex chars", encoded.len(), hex.len());
    }
}
