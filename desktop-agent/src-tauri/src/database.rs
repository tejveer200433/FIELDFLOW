use std::{path::Path, sync::Mutex};

use chrono::{SecondsFormat, Utc};
use rusqlite::{params, params_from_iter, Connection};

use crate::models::{NewSample, NewWebsiteSample, PendingSample, PendingWebsiteSample, SyncResult};

pub struct Database(pub Mutex<Connection>);

impl Database {
    pub fn open(path: &Path) -> Result<Self, String> {
        let connection = Connection::open(path).map_err(|error| error.to_string())?;
        connection.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS pending_samples (
               local_sample_id TEXT PRIMARY KEY,
               tracking_session_id TEXT NOT NULL,
               captured_at TEXT NOT NULL,
               keyboard_event_count INTEGER NOT NULL DEFAULT 0 CHECK (keyboard_event_count >= 0),
               mouse_event_count INTEGER NOT NULL DEFAULT 0 CHECK (mouse_event_count >= 0),
               idle_seconds INTEGER NOT NULL DEFAULT 0 CHECK (idle_seconds >= 0),
               active_application TEXT,
               screen_locked INTEGER NOT NULL DEFAULT 0 CHECK (screen_locked IN (0, 1)),
               sync_state TEXT NOT NULL DEFAULT 'pending' CHECK (sync_state IN ('pending', 'uploading', 'uploaded', 'failed')),
               permanent_failure INTEGER NOT NULL DEFAULT 0 CHECK (permanent_failure IN (0, 1)),
               attempt_count INTEGER NOT NULL DEFAULT 0,
               next_attempt_at TEXT NOT NULL,
               last_error TEXT,
               created_at TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS pending_samples_sync_idx
               ON pending_samples (sync_state, next_attempt_at, captured_at);
             CREATE INDEX IF NOT EXISTS pending_samples_session_sync_idx
               ON pending_samples (
                 tracking_session_id, sync_state, permanent_failure,
                 next_attempt_at, captured_at
               );
             CREATE TABLE IF NOT EXISTS pending_website_samples (
               local_sample_id TEXT PRIMARY KEY,
               tracking_session_id TEXT NOT NULL,
               captured_at TEXT NOT NULL,
               domain TEXT NOT NULL CHECK (length(domain) BETWEEN 1 AND 253),
               browser_name TEXT NOT NULL CHECK (length(browser_name) BETWEEN 1 AND 40),
               duration_seconds INTEGER NOT NULL CHECK (duration_seconds BETWEEN 1 AND 300),
               sync_state TEXT NOT NULL DEFAULT 'pending' CHECK (sync_state IN ('pending', 'uploading', 'uploaded', 'failed')),
               permanent_failure INTEGER NOT NULL DEFAULT 0 CHECK (permanent_failure IN (0, 1)),
               attempt_count INTEGER NOT NULL DEFAULT 0,
               next_attempt_at TEXT NOT NULL,
               last_error TEXT,
               created_at TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS pending_website_samples_sync_idx
               ON pending_website_samples (
                 tracking_session_id, sync_state, permanent_failure,
                 next_attempt_at, captured_at
               );
             CREATE TABLE IF NOT EXISTS agent_state (
               key TEXT PRIMARY KEY,
               value TEXT NOT NULL,
               updated_at TEXT NOT NULL
             );",
        ).map_err(|error| error.to_string())?;
        Ok(Self(Mutex::new(connection)))
    }

    #[cfg(test)]
    pub fn memory() -> Result<Self, String> {
        Self::open(Path::new(":memory:"))
    }
}

pub fn enqueue(database: &Database, sample: &NewSample) -> Result<(), String> {
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let connection = database
        .0
        .lock()
        .map_err(|_| "Database lock failed.".to_string())?;
    let queued: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM pending_samples WHERE sync_state != 'uploaded'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if queued >= 10_000 {
        return Err("The local activity queue is full. Tracking was paused without discarding pending samples.".to_string());
    }
    connection
        .execute(
            "INSERT OR IGNORE INTO pending_samples (
               local_sample_id, tracking_session_id, captured_at, keyboard_event_count,
               mouse_event_count, idle_seconds, active_application, screen_locked,
               next_attempt_at, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
            params![
                sample.local_sample_id,
                sample.tracking_session_id,
                sample.captured_at,
                sample.keyboard_event_count,
                sample.mouse_event_count,
                sample.idle_seconds,
                sample.active_application,
                sample.screen_locked,
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn pending(database: &Database, limit: u32) -> Result<Vec<PendingSample>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Database lock failed.".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT local_sample_id, tracking_session_id, captured_at, keyboard_event_count,
                mouse_event_count, idle_seconds, active_application, screen_locked
         FROM pending_samples
         WHERE sync_state IN ('pending', 'failed')
           AND permanent_failure = 0
           AND next_attempt_at <= ?1
         ORDER BY captured_at ASC LIMIT ?2",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![Utc::now().to_rfc3339(), limit.min(100)], |row| {
            Ok(PendingSample {
                local_sample_id: row.get(0)?,
                tracking_session_id: row.get(1)?,
                captured_at: row.get(2)?,
                keyboard_event_count: row.get(3)?,
                mouse_event_count: row.get(4)?,
                idle_seconds: row.get(5)?,
                active_application: row.get(6)?,
                screen_locked: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn enqueue_website_for_active_session(
    database: &Database,
    domain: &str,
    browser_name: &str,
    duration_seconds: i64,
) -> Result<Option<NewWebsiteSample>, String> {
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let connection = database
        .0
        .lock()
        .map_err(|_| "Database lock failed.".to_string())?;
    let state = |key: &str| -> Option<String> {
        connection
            .query_row(
                "SELECT value FROM agent_state WHERE key = ?1",
                [key],
                |row| row.get(0),
            )
            .ok()
    };
    if state("tracking_active").as_deref() != Some("true") {
        return Ok(None);
    }
    let Some(tracking_session_id) = state("tracking_session_id").filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };
    let queued: i64 = connection
        .query_row(
            "SELECT
               (SELECT COUNT(*) FROM pending_samples WHERE sync_state != 'uploaded' AND permanent_failure = 0) +
               (SELECT COUNT(*) FROM pending_website_samples WHERE sync_state != 'uploaded' AND permanent_failure = 0)",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if queued >= 10_000 {
        return Err("The local activity queue is full. Website collection was paused.".to_string());
    }
    let sample = NewWebsiteSample {
        local_sample_id: uuid::Uuid::new_v4().to_string(),
        tracking_session_id,
        captured_at: now.clone(),
        domain: domain.to_string(),
        browser_name: browser_name.to_string(),
        duration_seconds,
    };
    connection
        .execute(
            "INSERT INTO pending_website_samples (
               local_sample_id, tracking_session_id, captured_at, domain,
               browser_name, duration_seconds, next_attempt_at, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?3, ?3)",
            params![
                sample.local_sample_id,
                sample.tracking_session_id,
                sample.captured_at,
                sample.domain,
                sample.browser_name,
                sample.duration_seconds
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(Some(sample))
}

pub fn pending_websites(
    database: &Database,
    limit: u32,
) -> Result<Vec<PendingWebsiteSample>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Database lock failed.".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT local_sample_id, tracking_session_id, captured_at, domain,
                browser_name, duration_seconds
         FROM pending_website_samples
         WHERE sync_state IN ('pending', 'failed')
           AND permanent_failure = 0
           AND next_attempt_at <= ?1
         ORDER BY captured_at ASC LIMIT ?2",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![Utc::now().to_rfc3339(), limit.min(100)], |row| {
            Ok(PendingWebsiteSample {
                local_sample_id: row.get(0)?,
                tracking_session_id: row.get(1)?,
                captured_at: row.get(2)?,
                domain: row.get(3)?,
                browser_name: row.get(4)?,
                duration_seconds: row.get(5)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn placeholders(count: usize) -> String {
    std::iter::repeat_n("?", count)
        .collect::<Vec<_>>()
        .join(",")
}

pub fn mark_uploading(database: &Database, ids: &[String]) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    let query = format!(
        "UPDATE pending_samples SET sync_state = 'uploading' WHERE local_sample_id IN ({})",
        placeholders(ids.len())
    );
    database
        .0
        .lock()
        .map_err(|_| "Database lock failed.".to_string())?
        .execute(&query, params_from_iter(ids))
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn mark_websites_uploading(database: &Database, ids: &[String]) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    let query = format!(
        "UPDATE pending_website_samples SET sync_state = 'uploading' WHERE local_sample_id IN ({})",
        placeholders(ids.len())
    );
    database
        .0
        .lock()
        .map_err(|_| "Database lock failed.".to_string())?
        .execute(&query, params_from_iter(ids))
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn retry_delay_seconds(attempt: i64) -> i64 {
    5_i64
        .saturating_mul(2_i64.saturating_pow(attempt.clamp(0, 10) as u32))
        .min(3600)
}

pub fn release(
    database: &Database,
    ids: &[String],
    error: &str,
    retry_after_seconds: Option<i64>,
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    let connection = database
        .0
        .lock()
        .map_err(|_| "Database lock failed.".to_string())?;
    for id in ids {
        let attempt: i64 = connection
            .query_row(
                "SELECT attempt_count FROM pending_samples WHERE local_sample_id = ?1",
                [id],
                |row| row.get(0),
            )
            .unwrap_or(0)
            + 1;
        let delay =
            retry_delay_seconds(attempt).max(retry_after_seconds.unwrap_or(0).clamp(0, 86_400));
        let next = Utc::now() + chrono::Duration::seconds(delay);
        connection
            .execute(
                "UPDATE pending_samples SET sync_state = 'failed', attempt_count = ?2,
             next_attempt_at = ?3, last_error = ?4 WHERE local_sample_id = ?1",
                params![
                    id,
                    attempt,
                    next.to_rfc3339(),
                    error.chars().take(160).collect::<String>()
                ],
            )
            .map_err(|database_error| database_error.to_string())?;
    }
    Ok(())
}

pub fn release_websites(
    database: &Database,
    ids: &[String],
    error: &str,
    retry_after_seconds: Option<i64>,
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    let connection = database
        .0
        .lock()
        .map_err(|_| "Database lock failed.".to_string())?;
    for id in ids {
        let attempt: i64 = connection
            .query_row(
                "SELECT attempt_count FROM pending_website_samples WHERE local_sample_id = ?1",
                [id],
                |row| row.get(0),
            )
            .unwrap_or(0)
            + 1;
        let delay =
            retry_delay_seconds(attempt).max(retry_after_seconds.unwrap_or(0).clamp(0, 86_400));
        let next = Utc::now() + chrono::Duration::seconds(delay);
        connection
            .execute(
                "UPDATE pending_website_samples SET sync_state = 'failed', attempt_count = ?2,
             next_attempt_at = ?3, last_error = ?4 WHERE local_sample_id = ?1",
                params![
                    id,
                    attempt,
                    next.to_rfc3339(),
                    error.chars().take(160).collect::<String>()
                ],
            )
            .map_err(|database_error| database_error.to_string())?;
    }
    Ok(())
}

pub fn apply_result(database: &Database, result: &SyncResult) -> Result<(), String> {
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Database lock failed.".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    for id in &result.confirmed_ids {
        transaction
            .execute(
                "UPDATE pending_samples SET sync_state = 'uploaded', last_error = NULL,
             next_attempt_at = ?2 WHERE local_sample_id = ?1",
                params![id, Utc::now().to_rfc3339()],
            )
            .map_err(|error| error.to_string())?;
    }
    for failed in &result.failed {
        let attempt: i64 = transaction
            .query_row(
                "SELECT attempt_count FROM pending_samples WHERE local_sample_id = ?1",
                [&failed.id],
                |row| row.get(0),
            )
            .unwrap_or(0)
            + 1;
        let next = Utc::now() + chrono::Duration::seconds(retry_delay_seconds(attempt));
        transaction
            .execute(
                "UPDATE pending_samples SET sync_state = 'failed', permanent_failure = 1,
             attempt_count = ?2, next_attempt_at = ?3, last_error = ?4 WHERE local_sample_id = ?1",
                params![
                    failed.id,
                    attempt,
                    next.to_rfc3339(),
                    failed.error.chars().take(160).collect::<String>()
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction
        .execute(
            "DELETE FROM pending_samples WHERE sync_state = 'uploaded' AND next_attempt_at < ?1",
            [(Utc::now() - chrono::Duration::hours(24)).to_rfc3339()],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

pub fn apply_website_result(database: &Database, result: &SyncResult) -> Result<(), String> {
    let mut connection = database
        .0
        .lock()
        .map_err(|_| "Database lock failed.".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    for id in &result.confirmed_ids {
        transaction
            .execute(
                "UPDATE pending_website_samples SET sync_state = 'uploaded', last_error = NULL,
             next_attempt_at = ?2 WHERE local_sample_id = ?1",
                params![id, Utc::now().to_rfc3339()],
            )
            .map_err(|error| error.to_string())?;
    }
    for failed in &result.failed {
        transaction
            .execute(
                "UPDATE pending_website_samples SET sync_state = 'failed', permanent_failure = 1,
             attempt_count = attempt_count + 1, next_attempt_at = ?2, last_error = ?3
             WHERE local_sample_id = ?1",
                params![
                    failed.id,
                    Utc::now().to_rfc3339(),
                    failed.error.chars().take(160).collect::<String>()
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())
}

pub fn recover(database: &Database) -> Result<(), String> {
    database
        .0
        .lock()
        .map_err(|_| "Database lock failed.".to_string())?
        .execute_batch(
            "UPDATE pending_samples SET sync_state = 'pending' WHERE sync_state = 'uploading';
             UPDATE pending_website_samples SET sync_state = 'pending' WHERE sync_state = 'uploading';",
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn count(database: &Database) -> Result<i64, String> {
    database
        .0
        .lock()
        .map_err(|_| "Database lock failed.".to_string())?
        .query_row(
            "SELECT
               (SELECT COUNT(*) FROM pending_samples WHERE sync_state != 'uploaded' AND permanent_failure = 0) +
               (SELECT COUNT(*) FROM pending_website_samples WHERE sync_state != 'uploaded' AND permanent_failure = 0)",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}

pub fn set_state(database: &Database, key: &str, value: &str) -> Result<(), String> {
    database
        .0
        .lock()
        .map_err(|_| "Database lock failed.".to_string())?
        .execute(
            "INSERT INTO agent_state (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value, Utc::now().to_rfc3339()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn get_state(database: &Database, key: &str) -> Result<Option<String>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Database lock failed.".to_string())?;
    match connection.query_row(
        "SELECT value FROM agent_state WHERE key = ?1",
        [key],
        |row| row.get(0),
    ) {
        Ok(value) => Ok(Some(value)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        apply_result, count, enqueue, mark_uploading, pending, recover, retry_delay_seconds,
        Database,
    };
    use crate::models::{NewSample, SyncResult};

    #[test]
    fn retry_delay_is_bounded() {
        assert_eq!(retry_delay_seconds(0), 5);
        assert_eq!(retry_delay_seconds(3), 40);
        assert_eq!(retry_delay_seconds(100), 3600);
    }

    fn sample(id: &str) -> NewSample {
        NewSample {
            local_sample_id: id.to_string(),
            tracking_session_id: "session".to_string(),
            captured_at: "2026-07-28T12:00:00Z".to_string(),
            keyboard_event_count: 0,
            mouse_event_count: 0,
            idle_seconds: 10,
            active_application: Some("code".to_string()),
            screen_locked: false,
        }
    }

    #[test]
    fn queue_recovers_uploading_rows_and_retains_server_confirmation() {
        let database = Database::memory().unwrap();
        enqueue(&database, &sample("sample-1")).unwrap();
        assert_eq!(count(&database).unwrap(), 1);
        mark_uploading(&database, &["sample-1".to_string()]).unwrap();
        recover(&database).unwrap();
        let queued = pending(&database, 100).unwrap();
        assert_eq!(queued.len(), 1);
        assert_eq!(queued[0].tracking_session_id, "session");
        apply_result(
            &database,
            &SyncResult {
                confirmed_ids: vec!["sample-1".to_string()],
                failed: vec![],
            },
        )
        .unwrap();
        assert_eq!(count(&database).unwrap(), 0);
    }
}
