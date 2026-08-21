use std::{thread, time::Duration};

use tauri::{AppHandle, Emitter, Manager};
use windows::{
    core::w,
    Win32::{
        Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE, WAIT_OBJECT_0},
        System::Threading::{
            CreateEventW, CreateMutexW, OpenEventW, SetEvent, WaitForSingleObject,
            EVENT_MODIFY_STATE, INFINITE,
        },
    },
};

const INSTANCE_MUTEX_NAME: windows::core::PCWSTR = w!("Local\\FieldFlowActivityAgent.Primary.0.4");
const RECOVERY_EVENT_NAME: windows::core::PCWSTR = w!("Local\\FieldFlowActivityAgent.Recovery.0.4");
const SHOW_EVENT_NAME: windows::core::PCWSTR = w!("Local\\FieldFlowActivityAgent.Show.0.4");

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum LaunchReason {
    Interactive,
    Recovery,
    Watchdog,
}

fn launch_reason(arguments: &[String]) -> LaunchReason {
    if arguments.iter().any(|argument| argument == "--watchdog") {
        LaunchReason::Watchdog
    } else if arguments.iter().any(|argument| argument == "--recovery") {
        LaunchReason::Recovery
    } else {
        LaunchReason::Interactive
    }
}

pub enum AcquireResult {
    Primary(PrimaryInstance),
    SecondarySignalled,
}

pub struct PrimaryInstance {
    mutex: HANDLE,
    recovery_event: HANDLE,
    show_event: HANDLE,
}

// These handles name process-wide Windows synchronization primitives. Waiting on or closing
// them from a background listener is supported by Win32 and does not expose process memory.
unsafe impl Send for PrimaryInstance {}
unsafe impl Sync for PrimaryInstance {}

impl Drop for PrimaryInstance {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.show_event);
            let _ = CloseHandle(self.recovery_event);
            let _ = CloseHandle(self.mutex);
        }
    }
}

fn signal_existing(event_name: windows::core::PCWSTR) -> Result<(), String> {
    // A simultaneous logon/resume can reach this branch before the primary has finished
    // creating its events. Retry briefly without ever constructing a second WebView or auth
    // client; this is the critical boundary that prevents refresh-token races.
    for _ in 0..40 {
        let event = unsafe { OpenEventW(EVENT_MODIFY_STATE, false, event_name) };
        if let Ok(event) = event {
            let result = unsafe { SetEvent(event) }.map_err(|error| error.to_string());
            unsafe {
                let _ = CloseHandle(event);
            }
            return result;
        }
        thread::sleep(Duration::from_millis(50));
    }
    Err("The running FieldFlow Agent could not receive the startup signal.".to_string())
}

pub fn acquire(arguments: &[String]) -> Result<AcquireResult, String> {
    unsafe {
        let mutex = CreateMutexW(None, true, INSTANCE_MUTEX_NAME)
            .map_err(|error| format!("FieldFlow could not create its instance lock: {error}"))?;
        if GetLastError() == ERROR_ALREADY_EXISTS {
            let _ = CloseHandle(mutex);
            match launch_reason(arguments) {
                LaunchReason::Watchdog => {}
                LaunchReason::Recovery => signal_existing(RECOVERY_EVENT_NAME)?,
                LaunchReason::Interactive => signal_existing(SHOW_EVENT_NAME)?,
            }
            return Ok(AcquireResult::SecondarySignalled);
        }

        let recovery_event = match CreateEventW(None, false, false, RECOVERY_EVENT_NAME) {
            Ok(event) => event,
            Err(error) => {
                let _ = CloseHandle(mutex);
                return Err(format!(
                    "FieldFlow could not create its recovery signal: {error}"
                ));
            }
        };
        let show_event = match CreateEventW(None, false, false, SHOW_EVENT_NAME) {
            Ok(event) => event,
            Err(error) => {
                let _ = CloseHandle(recovery_event);
                let _ = CloseHandle(mutex);
                return Err(format!(
                    "FieldFlow could not create its window signal: {error}"
                ));
            }
        };

        Ok(AcquireResult::Primary(PrimaryInstance {
            mutex,
            recovery_event,
            show_event,
        }))
    }
}

impl PrimaryInstance {
    pub fn start_listeners(&self, app: AppHandle) {
        // windows::HANDLE is not marked Send because it wraps a raw pointer. Pass only the
        // stable numeric handle value into each listener and reconstruct it on that thread.
        let recovery_event_value = self.recovery_event.0 as usize;
        let recovery_app = app.clone();
        thread::spawn(move || {
            let recovery_event = HANDLE(recovery_event_value as *mut _);
            loop {
                if unsafe { WaitForSingleObject(recovery_event, INFINITE) } != WAIT_OBJECT_0 {
                    break;
                }
                let _ = recovery_app.emit("agent-resume-requested", ());
            }
        });

        let show_event_value = self.show_event.0 as usize;
        thread::spawn(move || {
            let show_event = HANDLE(show_event_value as *mut _);
            loop {
                if unsafe { WaitForSingleObject(show_event, INFINITE) } != WAIT_OBJECT_0 {
                    break;
                }
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::{launch_reason, LaunchReason};

    #[test]
    fn watchdog_never_asks_the_primary_to_refresh() {
        assert_eq!(
            launch_reason(&["agent.exe".into(), "--watchdog".into()]),
            LaunchReason::Watchdog
        );
    }

    #[test]
    fn recovery_and_interactive_launches_are_distinct() {
        assert_eq!(
            launch_reason(&["agent.exe".into(), "--recovery".into()]),
            LaunchReason::Recovery
        );
        assert_eq!(
            launch_reason(&["agent.exe".into()]),
            LaunchReason::Interactive
        );
    }
}
