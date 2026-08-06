use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewSample {
    pub local_sample_id: String,
    pub tracking_session_id: String,
    pub captured_at: String,
    pub keyboard_event_count: i64,
    pub mouse_event_count: i64,
    pub idle_seconds: i64,
    pub active_application: Option<String>,
    pub screen_locked: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingSample {
    pub local_sample_id: String,
    pub tracking_session_id: String,
    pub captured_at: String,
    pub keyboard_event_count: i64,
    pub mouse_event_count: i64,
    pub idle_seconds: i64,
    pub active_application: Option<String>,
    pub screen_locked: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodingContext {
    pub ide_name: String,
    pub project_name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewCodingSample {
    pub local_sample_id: String,
    pub tracking_session_id: String,
    pub captured_at: String,
    pub ide_name: String,
    pub project_name: String,
    pub duration_seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingCodingSample {
    pub local_sample_id: String,
    pub tracking_session_id: String,
    pub captured_at: String,
    pub ide_name: String,
    pub project_name: String,
    pub duration_seconds: i64,
}

#[derive(Debug, Clone)]
pub struct NewWebsiteSample {
    pub local_sample_id: String,
    pub tracking_session_id: String,
    pub captured_at: String,
    pub domain: String,
    pub browser_name: String,
    pub duration_seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingWebsiteSample {
    pub local_sample_id: String,
    pub tracking_session_id: String,
    pub captured_at: String,
    pub domain: String,
    pub browser_name: String,
    pub duration_seconds: i64,
}

#[derive(Debug, Clone)]
pub struct NewScreenshotSample {
    pub local_sample_id: String,
    pub tracking_session_id: String,
    pub captured_at: String,
    pub file_path: String,
    pub active_application: Option<String>,
    pub byte_size: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingScreenshotSample {
    pub local_sample_id: String,
    pub tracking_session_id: String,
    pub captured_at: String,
    pub file_path: String,
    pub active_application: Option<String>,
    pub byte_size: i64,
}

#[derive(Debug, Deserialize)]
pub struct FailedSample {
    pub id: String,
    pub error: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub confirmed_ids: Vec<String>,
    pub failed: Vec<FailedSample>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputActivityCounts {
    pub keyboard_event_count: u64,
    pub mouse_event_count: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentity {
    pub device_name: String,
    pub operating_system_version: String,
    pub stable_identifier: String,
}
