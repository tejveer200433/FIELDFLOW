const SERVICE_NAME: &str = "com.fieldflow.activity-agent";

fn entry(key: &str) -> Result<keyring::Entry, String> {
    if key.is_empty() || key.len() > 160 {
        return Err("Invalid secure-storage key.".to_string());
    }
    keyring::Entry::new(SERVICE_NAME, key).map_err(|error| error.to_string())
}

pub fn write(key: &str, value: &str) -> Result<(), String> {
    entry(key)?
        .set_password(value)
        .map_err(|error| error.to_string())
}

pub fn read(key: &str) -> Result<Option<String>, String> {
    match entry(key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub fn delete(key: &str) -> Result<(), String> {
    match entry(key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::{delete, read, write};

    #[test]
    fn windows_credential_manager_round_trip_is_persistent_and_removable() {
        let key = format!("fieldflow-test-{}", uuid::Uuid::new_v4());
        let value = "temporary-fieldflow-credential-test";
        write(&key, value).expect("Windows Credential Manager rejected a test write");
        let result = read(&key).expect("Windows Credential Manager rejected a test read");
        let cleanup = delete(&key);
        assert_eq!(result.as_deref(), Some(value));
        cleanup.expect("Windows Credential Manager rejected test cleanup");
        assert_eq!(read(&key).expect("test credential lookup failed"), None);
    }
}
