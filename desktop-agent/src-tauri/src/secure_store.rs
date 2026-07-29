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
