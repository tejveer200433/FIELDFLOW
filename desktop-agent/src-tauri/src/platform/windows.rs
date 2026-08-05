use std::{ffi::OsString, os::windows::ffi::OsStringExt};

use sha2::{Digest, Sha256};
use windows::{
    core::PCWSTR,
    Win32::{
        Foundation::{CloseHandle, ERROR_SUCCESS},
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
                TH32CS_SNAPPROCESS,
            },
            Registry::{
                RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_READ,
                REG_VALUE_TYPE,
            },
            StationsAndDesktops::{CloseDesktop, OpenInputDesktop, DESKTOP_SWITCHDESKTOP},
            SystemInformation::GetTickCount,
            Threading::GetCurrentProcessId,
        },
        UI::{
            Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO},
            WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId},
        },
    },
};

use crate::models::{CodingContext, DeviceIdentity};

pub fn elapsed_ticks(now: u32, last: u32) -> u32 {
    now.wrapping_sub(last)
}

pub fn sanitize_application_name(filename: &str) -> Option<String> {
    let stem = filename.strip_suffix(".exe").unwrap_or(filename);
    let sanitized: String = stem
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, ' ' | '-' | '_' | '.')
        })
        .take(120)
        .collect();
    (!sanitized.is_empty()).then_some(sanitized)
}

pub fn idle_seconds() -> Result<u64, String> {
    let mut info = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    unsafe {
        if !GetLastInputInfo(&mut info).as_bool() {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok((elapsed_ticks(GetTickCount(), info.dwTime) / 1000) as u64)
    }
}

pub fn screen_locked() -> Result<bool, String> {
    unsafe {
        match OpenInputDesktop(Default::default(), false, DESKTOP_SWITCHDESKTOP) {
            Ok(desktop) => {
                let _ = CloseDesktop(desktop);
                Ok(false)
            }
            Err(_) => Ok(true),
        }
    }
}

fn process_name(process_id: u32) -> Result<Option<String>, String> {
    unsafe {
        let snapshot =
            CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).map_err(|error| error.to_string())?;
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut found = None;
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                if entry.th32ProcessID == process_id && process_id != GetCurrentProcessId() {
                    let length = entry
                        .szExeFile
                        .iter()
                        .position(|character| *character == 0)
                        .unwrap_or(entry.szExeFile.len());
                    let filename = OsString::from_wide(&entry.szExeFile[..length])
                        .to_string_lossy()
                        .into_owned();
                    found = sanitize_application_name(&filename);
                    break;
                }
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
        Ok(found)
    }
}

pub fn active_application() -> Result<Option<String>, String> {
    unsafe {
        let window = GetForegroundWindow();
        if window.0.is_null() {
            return Ok(None);
        }
        let mut process_id = 0;
        GetWindowThreadProcessId(window, Some(&mut process_id));
        if process_id == 0 {
            return Ok(None);
        }
        process_name(process_id)
    }
}

/// Only these four IDEs are recognized; extending this list later is a one-line addition.
fn ide_label_for_process(process: &str) -> Option<&'static str> {
    match process {
        "Code" | "Code - Insiders" => Some("vscode"),
        "Cursor" => Some("cursor"),
        "idea64" | "idea" => Some("intellij"),
        "eclipse" => Some("eclipse"),
        _ => None,
    }
}

fn sanitize_project_name(value: &str) -> Option<String> {
    let sanitized: String = value
        .trim()
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, ' ' | '-' | '_' | '.')
        })
        .take(160)
        .collect();
    let sanitized = sanitized.trim().to_string();
    (!sanitized.is_empty()).then_some(sanitized)
}

const CODE_LIKE_SUFFIXES: [&str; 3] = [
    " - Visual Studio Code - Insiders",
    " - Visual Studio Code",
    " - Cursor",
];

/// VS Code / Cursor titles look like "file.js - myproject - Visual Studio Code" (or just
/// "myproject - Visual Studio Code" with no file open). Strip the known product suffix,
/// then take the last " - "-separated segment -- this is the project/workspace name
/// regardless of whether a file name precedes it.
fn parse_vscode_like_project(title: &str) -> Option<String> {
    let remainder = CODE_LIKE_SUFFIXES
        .iter()
        .find_map(|suffix| title.strip_suffix(suffix))?;
    let project = remainder.rsplit(" - ").next().unwrap_or(remainder);
    sanitize_project_name(project)
}

/// IntelliJ titles look like "myproject – [module] – file.java – IntelliJ IDEA 2024.1"
/// (an en dash, not a hyphen, in most versions). The project name is the first segment.
fn parse_intellij_project(title: &str) -> Option<String> {
    let normalized = title.replace('\u{2013}', "-");
    let parts: Vec<&str> = normalized.split(" - ").collect();
    if parts.len() < 2 || !parts.last()?.contains("IntelliJ") {
        return None;
    }
    sanitize_project_name(parts[0])
}

/// Eclipse titles are the least consistent (often a resource path, e.g.
/// "file.java - myproject/src/main - Eclipse IDE"). Best-effort only: take the middle
/// segment when a resource path is present, then its first path component.
fn parse_eclipse_project(title: &str) -> Option<String> {
    let parts: Vec<&str> = title.split(" - ").collect();
    let candidate = match parts.len() {
        0 | 1 => return None,
        2 => parts[0],
        _ => parts[1],
    };
    let project = candidate.split(['/', '\\']).next()?;
    sanitize_project_name(project)
}

fn project_name_from_title(ide_label: &str, title: &str) -> Option<String> {
    match ide_label {
        "vscode" | "cursor" => parse_vscode_like_project(title),
        "intellij" => parse_intellij_project(title),
        "eclipse" => parse_eclipse_project(title),
        _ => None,
    }
}

fn window_title(window: windows::Win32::Foundation::HWND) -> Option<String> {
    let mut buffer = [0u16; 512];
    let length = unsafe { GetWindowTextW(window, &mut buffer) };
    if length <= 0 {
        return None;
    }
    Some(String::from_utf16_lossy(&buffer[..length as usize]))
}

/// Reports which recognized IDE is focused and, best-effort, which project/workspace is
/// open. The raw window title is read only inside this function and immediately parsed
/// down to a short sanitized project label -- it never leaves this function, matching the
/// existing privacy boundary around `active_application()` (no window titles, file names,
/// or paths are ever stored or uploaded).
pub fn active_coding_context() -> Result<Option<CodingContext>, String> {
    unsafe {
        let window = GetForegroundWindow();
        if window.0.is_null() {
            return Ok(None);
        }
        let mut process_id = 0;
        GetWindowThreadProcessId(window, Some(&mut process_id));
        if process_id == 0 {
            return Ok(None);
        }
        let Some(process) = process_name(process_id)? else {
            return Ok(None);
        };
        let Some(ide_label) = ide_label_for_process(&process) else {
            return Ok(None);
        };
        let Some(title) = window_title(window) else {
            return Ok(None);
        };
        let Some(project_name) = project_name_from_title(ide_label, &title) else {
            return Ok(None);
        };
        Ok(Some(CodingContext {
            ide_name: ide_label.to_string(),
            project_name,
        }))
    }
}

fn read_registry_string(root: HKEY, path: &str, name: &str) -> Result<String, String> {
    let path: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
    let name: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
    unsafe {
        let mut key = HKEY::default();
        let open_status = RegOpenKeyExW(root, PCWSTR(path.as_ptr()), 0, KEY_READ, &mut key);
        if open_status != ERROR_SUCCESS {
            return Err(format!(
                "Windows registry operation failed with code {}.",
                open_status.0
            ));
        }
        let mut value_type = REG_VALUE_TYPE::default();
        let mut size = 0u32;
        let first = RegQueryValueExW(
            key,
            PCWSTR(name.as_ptr()),
            None,
            Some(&mut value_type),
            None,
            Some(&mut size),
        );
        if first != ERROR_SUCCESS {
            let _ = RegCloseKey(key);
            return Err(format!(
                "Windows registry operation failed with code {}.",
                first.0
            ));
        }
        let mut buffer = vec![0u8; size as usize];
        let result = RegQueryValueExW(
            key,
            PCWSTR(name.as_ptr()),
            None,
            Some(&mut value_type),
            Some(buffer.as_mut_ptr()),
            Some(&mut size),
        );
        let _ = RegCloseKey(key);
        if result != ERROR_SUCCESS {
            return Err(format!(
                "Windows registry operation failed with code {}.",
                result.0
            ));
        }
        let wide = std::slice::from_raw_parts(buffer.as_ptr() as *const u16, buffer.len() / 2);
        let length = wide
            .iter()
            .position(|value| *value == 0)
            .unwrap_or(wide.len());
        Ok(String::from_utf16_lossy(&wide[..length]))
    }
}

pub fn device_identity() -> Result<DeviceIdentity, String> {
    let machine_guid = read_registry_string(
        HKEY_LOCAL_MACHINE,
        r"SOFTWARE\Microsoft\Cryptography",
        "MachineGuid",
    )?;
    let product_name = read_registry_string(
        HKEY_LOCAL_MACHINE,
        r"SOFTWARE\Microsoft\Windows NT\CurrentVersion",
        "ProductName",
    )
    .unwrap_or_else(|_| "Windows".to_string());
    let device_name =
        std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Windows device".to_string());
    let stable_identifier = hex::encode(Sha256::digest(
        format!("fieldflow-activity-agent:v1:{machine_guid}").as_bytes(),
    ));
    Ok(DeviceIdentity {
        device_name: device_name.chars().take(160).collect(),
        operating_system_version: product_name.chars().take(160).collect(),
        stable_identifier,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        elapsed_ticks, ide_label_for_process, parse_eclipse_project, parse_intellij_project,
        parse_vscode_like_project, sanitize_application_name,
    };

    #[test]
    fn elapsed_ticks_handles_windows_counter_wraparound() {
        assert_eq!(elapsed_ticks(20, u32::MAX - 9), 30);
    }

    #[test]
    fn ide_is_recognized_only_for_the_four_supported_editors() {
        assert_eq!(ide_label_for_process("Code"), Some("vscode"));
        assert_eq!(ide_label_for_process("Code - Insiders"), Some("vscode"));
        assert_eq!(ide_label_for_process("Cursor"), Some("cursor"));
        assert_eq!(ide_label_for_process("idea64"), Some("intellij"));
        assert_eq!(ide_label_for_process("idea"), Some("intellij"));
        assert_eq!(ide_label_for_process("eclipse"), Some("eclipse"));
        assert_eq!(ide_label_for_process("notepad"), None);
    }

    #[test]
    fn vscode_project_is_the_segment_before_the_product_suffix() {
        assert_eq!(
            parse_vscode_like_project("app.js - fieldflow-nextjs - Visual Studio Code").as_deref(),
            Some("fieldflow-nextjs")
        );
        assert_eq!(
            parse_vscode_like_project("fieldflow-nextjs - Visual Studio Code").as_deref(),
            Some("fieldflow-nextjs")
        );
        assert_eq!(
            parse_vscode_like_project("main.rs - agent - Cursor").as_deref(),
            Some("agent")
        );
        assert_eq!(
            parse_vscode_like_project("proj - Visual Studio Code - Insiders").as_deref(),
            Some("proj")
        );
        assert_eq!(parse_vscode_like_project("Untitled-1"), None);
    }

    #[test]
    fn intellij_project_is_the_first_segment() {
        assert_eq!(
            parse_intellij_project("fieldflow \u{2013} [app] \u{2013} App.java \u{2013} IntelliJ IDEA 2024.1")
                .as_deref(),
            Some("fieldflow")
        );
        assert_eq!(
            parse_intellij_project("fieldflow - IntelliJ IDEA").as_deref(),
            Some("fieldflow")
        );
        assert_eq!(parse_intellij_project("Welcome to IntelliJ IDEA"), None);
    }

    #[test]
    fn eclipse_project_is_best_effort_from_the_resource_path() {
        assert_eq!(
            parse_eclipse_project("App.java - fieldflow/src/main/java - Eclipse IDE").as_deref(),
            Some("fieldflow")
        );
        assert_eq!(
            parse_eclipse_project("fieldflow - Eclipse IDE").as_deref(),
            Some("fieldflow")
        );
        assert_eq!(parse_eclipse_project("Eclipse IDE"), None);
    }

    #[test]
    fn application_name_is_sanitized_and_bounded() {
        assert_eq!(
            sanitize_application_name("Code.exe").as_deref(),
            Some("Code")
        );
        assert_eq!(
            sanitize_application_name("bad<>|name.exe").as_deref(),
            Some("badname")
        );
        assert_eq!(
            sanitize_application_name(&format!("{}.exe", "a".repeat(200)))
                .unwrap()
                .len(),
            120
        );
        assert_eq!(sanitize_application_name("<>|"), None);
    }
}
