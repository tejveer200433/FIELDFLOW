#[cfg(windows)]
use std::{env, fs, os::windows::ffi::OsStrExt, path::Path, process::Command};

#[cfg(windows)]
const TASK_NAME: &str = "FieldFlow Activity Agent Recovery";

#[cfg(windows)]
fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(windows)]
fn current_user() -> Result<String, String> {
    let username = env::var("USERNAME").map_err(|_| "Windows user identity is unavailable.")?;
    let domain = env::var("USERDOMAIN").unwrap_or_default();
    Ok(if domain.is_empty() {
        username
    } else {
        format!("{domain}\\{username}")
    })
}

#[cfg(windows)]
fn task_xml(executable: &Path, user: &str) -> String {
    let executable = xml_escape(&executable.to_string_lossy());
    let user = xml_escape(user);
    format!(
        r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Restarts FieldFlow after sign-in, system resume, or workstation unlock.</Description></RegistrationInfo>
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled><UserId>{user}</UserId></LogonTrigger>
    <SessionStateChangeTrigger><Enabled>true</Enabled><StateChange>SessionUnlock</StateChange><UserId>{user}</UserId></SessionStateChangeTrigger>
    <EventTrigger>
      <Enabled>true</Enabled>
      <Subscription>&lt;QueryList&gt;&lt;Query Id="0" Path="System"&gt;&lt;Select Path="System"&gt;*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1]]&lt;/Select&gt;&lt;/Query&gt;&lt;/QueryList&gt;</Subscription>
    </EventTrigger>
  </Triggers>
  <Principals><Principal id="Author"><UserId>{user}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>Parallel</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>
  </Settings>
  <Actions Context="Author"><Exec><Command>{executable}</Command><Arguments>--minimized --recovery</Arguments></Exec></Actions>
</Task>"#
    )
}

#[cfg(windows)]
fn write_utf16(path: &Path, value: &str) -> Result<(), String> {
    let mut bytes = vec![0xff, 0xfe];
    for unit in std::ffi::OsStr::new(value).encode_wide() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    fs::write(path, bytes).map_err(|error| error.to_string())
}

#[cfg(windows)]
pub fn ensure(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    let executable = env::current_exe().map_err(|error| error.to_string())?;
    let user = current_user()?;
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let task_file = directory.join("windows-recovery-task.xml");
    write_utf16(&task_file, &task_xml(&executable, &user))?;
    let output = Command::new("schtasks.exe")
        .args(["/Create", "/TN", TASK_NAME, "/XML"])
        .arg(&task_file)
        .arg("/F")
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let _ = fs::remove_file(&task_file);
        return Err(if detail.is_empty() {
            "Windows Task Scheduler rejected the FieldFlow recovery task.".to_string()
        } else {
            format!("Windows Task Scheduler rejected the FieldFlow recovery task: {detail}")
        });
    }

    let query = Command::new("schtasks.exe")
        .args(["/Query", "/TN", TASK_NAME, "/XML"])
        .output()
        .map_err(|error| error.to_string())?;
    let _ = fs::remove_file(&task_file);
    if !query.status.success() {
        let detail = String::from_utf8_lossy(&query.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            "Windows could not verify the FieldFlow recovery task after creating it.".to_string()
        } else {
            format!("Windows could not verify the FieldFlow recovery task: {detail}")
        });
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn ensure(_app: &tauri::AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(all(test, windows))]
mod tests {
    use super::task_xml;
    use std::path::Path;

    #[test]
    fn recovery_task_covers_sign_in_unlock_resume_and_failure() {
        let xml = task_xml(
            Path::new(r"C:\Program Files\FieldFlow\agent.exe"),
            r"DOMAIN\employee",
        );
        assert!(xml.contains("<LogonTrigger>"));
        assert!(xml.contains("<StateChange>SessionUnlock</StateChange>"));
        assert!(xml.contains("Microsoft-Windows-Power-Troubleshooter"));
        assert!(xml.contains("<RestartOnFailure>"));
        assert!(xml.contains("<MultipleInstancesPolicy>Parallel</MultipleInstancesPolicy>"));
        assert!(xml.contains("--minimized --recovery"));
    }
}
