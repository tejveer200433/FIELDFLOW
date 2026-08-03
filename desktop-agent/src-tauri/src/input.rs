use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    mpsc, OnceLock,
};

use windows::Win32::{
    Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
    UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, SetWindowsHookExW, UnhookWindowsHookEx, HC_ACTION, HHOOK, MSG,
        WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
    },
};

use crate::models::InputActivityCounts;

static COLLECTION_ENABLED: AtomicBool = AtomicBool::new(false);
static KEYBOARD_EVENTS: AtomicU64 = AtomicU64::new(0);
static MOUSE_EVENTS: AtomicU64 = AtomicU64::new(0);
static MONITOR_STARTED: OnceLock<Result<(), String>> = OnceLock::new();

fn reset_counts() {
    KEYBOARD_EVENTS.store(0, Ordering::Relaxed);
    MOUSE_EVENTS.store(0, Ordering::Relaxed);
}

fn record_keyboard_event() {
    if COLLECTION_ENABLED.load(Ordering::Relaxed) {
        KEYBOARD_EVENTS.fetch_add(1, Ordering::Relaxed);
    }
}

fn record_mouse_event() {
    if COLLECTION_ENABLED.load(Ordering::Relaxed) {
        MOUSE_EVENTS.fetch_add(1, Ordering::Relaxed);
    }
}

unsafe extern "system" fn keyboard_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 && matches!(wparam.0 as u32, WM_KEYDOWN | WM_SYSKEYDOWN) {
        record_keyboard_event();
    }
    unsafe { CallNextHookEx(HHOOK::default(), code, wparam, lparam) }
}

unsafe extern "system" fn mouse_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        record_mouse_event();
    }
    unsafe { CallNextHookEx(HHOOK::default(), code, wparam, lparam) }
}

fn start_monitor_thread() -> Result<(), String> {
    let (sender, receiver) = mpsc::sync_channel(1);
    std::thread::Builder::new()
        .name("fieldflow-input-counter".to_string())
        .spawn(move || unsafe {
            let keyboard = match SetWindowsHookExW(
                WH_KEYBOARD_LL,
                Some(keyboard_hook),
                HINSTANCE::default(),
                0,
            ) {
                Ok(hook) => hook,
                Err(error) => {
                    let _ = sender.send(Err(format!(
                        "Windows keyboard activity counting could not start: {error}"
                    )));
                    return;
                }
            };
            let mouse =
                match SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook), HINSTANCE::default(), 0) {
                    Ok(hook) => hook,
                    Err(error) => {
                        let _ = UnhookWindowsHookEx(keyboard);
                        let _ = sender.send(Err(format!(
                            "Windows mouse activity counting could not start: {error}"
                        )));
                        return;
                    }
                };
            let _ = sender.send(Ok(()));

            let mut message = MSG::default();
            while GetMessageW(&mut message, HWND::default(), 0, 0).0 > 0 {}

            let _ = UnhookWindowsHookEx(mouse);
            let _ = UnhookWindowsHookEx(keyboard);
        })
        .map_err(|error| format!("The input activity counter thread could not start: {error}"))?;

    receiver
        .recv()
        .map_err(|_| "The input activity counter stopped during startup.".to_string())?
}

pub fn start_monitoring() -> Result<(), String> {
    MONITOR_STARTED.get_or_init(start_monitor_thread).clone()
}

pub fn set_collection_enabled(enabled: bool) -> Result<(), String> {
    if enabled {
        start_monitoring()?;
        reset_counts();
        COLLECTION_ENABLED.store(true, Ordering::Relaxed);
    } else {
        COLLECTION_ENABLED.store(false, Ordering::Relaxed);
        reset_counts();
    }
    Ok(())
}

pub fn take_counts() -> InputActivityCounts {
    InputActivityCounts {
        keyboard_event_count: KEYBOARD_EVENTS.swap(0, Ordering::Relaxed),
        mouse_event_count: MOUSE_EVENTS.swap(0, Ordering::Relaxed),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        record_keyboard_event, record_mouse_event, set_collection_enabled, take_counts,
        COLLECTION_ENABLED,
    };
    use std::sync::atomic::Ordering;

    #[test]
    fn only_aggregate_counts_are_retained_while_collection_is_enabled() {
        COLLECTION_ENABLED.store(true, Ordering::Relaxed);
        record_keyboard_event();
        record_keyboard_event();
        record_mouse_event();
        let counts = take_counts();
        assert_eq!(counts.keyboard_event_count, 2);
        assert_eq!(counts.mouse_event_count, 1);

        set_collection_enabled(false).unwrap();
        record_keyboard_event();
        record_mouse_event();
        let stopped_counts = take_counts();
        assert_eq!(stopped_counts.keyboard_event_count, 0);
        assert_eq!(stopped_counts.mouse_event_count, 0);
    }
}
