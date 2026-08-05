#[cfg(windows)]
mod windows;

#[cfg(windows)]
pub use windows::{
    active_application, active_coding_context, device_identity, idle_seconds, screen_locked,
};

#[cfg(not(windows))]
pub fn idle_seconds() -> Result<u64, String> {
    Err("The FIELD-FLOW desktop agent currently supports Windows only.".to_string())
}

#[cfg(not(windows))]
pub fn screen_locked() -> Result<bool, String> {
    Err("The FIELD-FLOW desktop agent currently supports Windows only.".to_string())
}

#[cfg(not(windows))]
pub fn active_application() -> Result<Option<String>, String> {
    Err("The FIELD-FLOW desktop agent currently supports Windows only.".to_string())
}

#[cfg(not(windows))]
pub fn active_coding_context() -> Result<Option<crate::models::CodingContext>, String> {
    Err("The FIELD-FLOW desktop agent currently supports Windows only.".to_string())
}

#[cfg(not(windows))]
pub fn device_identity() -> Result<crate::models::DeviceIdentity, String> {
    Err("The FIELD-FLOW desktop agent currently supports Windows only.".to_string())
}
