use std::io::Read;

use serde::Deserialize;
use tauri::{AppHandle, Manager};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

use crate::database::{self, Database};

pub const BRIDGE_PORT: u16 = 38_473;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DomainReport {
    domain: String,
    browser_name: String,
    duration_seconds: Option<i64>,
}

fn extension_origin(request: &Request) -> Option<String> {
    let value = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Origin"))?
        .value
        .as_str();
    (value.starts_with("chrome-extension://") || value.starts_with("moz-extension://"))
        .then(|| value.to_string())
}

fn valid_hostname(value: &str) -> bool {
    if value.is_empty() || value.len() > 253 || value.contains(['/', '?', ':', '#', '@']) {
        return false;
    }
    value.split('.').all(|label| {
        !label.is_empty()
            && label.len() <= 63
            && label
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
            && label
                .as_bytes()
                .first()
                .is_some_and(u8::is_ascii_alphanumeric)
            && label
                .as_bytes()
                .last()
                .is_some_and(u8::is_ascii_alphanumeric)
    })
}

fn valid_browser_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 40
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("static HTTP header is valid")
}

fn respond(request: Request, origin: Option<&str>, status: u16, body: &str) {
    let mut response = Response::from_string(body)
        .with_status_code(StatusCode(status))
        .with_header(header("Content-Type", "application/json; charset=utf-8"))
        .with_header(header("Cache-Control", "no-store"));
    if let Some(origin) = origin {
        response.add_header(header("Access-Control-Allow-Origin", origin));
        response.add_header(header("Vary", "Origin"));
        response.add_header(header("Access-Control-Allow-Headers", "Content-Type"));
        response.add_header(header("Access-Control-Allow-Methods", "GET, POST, OPTIONS"));
        response.add_header(header("Access-Control-Allow-Private-Network", "true"));
    }
    let _ = request.respond(response);
}

fn handle(mut request: Request, app: &AppHandle) {
    let origin = extension_origin(&request);
    if origin.is_none() {
        respond(
            request,
            None,
            403,
            r#"{"accepted":false,"state":"forbidden"}"#,
        );
        return;
    }
    let origin_value = origin.as_deref();
    if request.method() == &Method::Options {
        respond(request, origin_value, 204, "");
        return;
    }
    let database = app.state::<Database>();
    if request.method() == &Method::Get && request.url() == "/v1/status" {
        let active = database::get_state(&database, "tracking_active")
            .ok()
            .flatten()
            .as_deref()
            == Some("true");
        respond(
            request,
            origin_value,
            200,
            if active {
                r#"{"connected":true,"tracking":true}"#
            } else {
                r#"{"connected":true,"tracking":false}"#
            },
        );
        return;
    }
    if request.method() == &Method::Get && request.url() == "/v1/blocklist" {
        let blocklist = database::get_state(&database, "blocklist_json")
            .ok()
            .flatten()
            .unwrap_or_else(|| r#"{"blockedDomains":[],"overrides":[]}"#.to_string());
        respond(request, origin_value, 200, &blocklist);
        return;
    }
    if request.method() != &Method::Post || request.url() != "/v1/domain" {
        respond(
            request,
            origin_value,
            404,
            r#"{"accepted":false,"state":"not-found"}"#,
        );
        return;
    }
    if request.body_length().unwrap_or(0) > 4096 {
        respond(
            request,
            origin_value,
            413,
            r#"{"accepted":false,"state":"invalid"}"#,
        );
        return;
    }
    let mut bytes = Vec::new();
    if request
        .as_reader()
        .take(4097)
        .read_to_end(&mut bytes)
        .is_err()
        || bytes.len() > 4096
    {
        respond(
            request,
            origin_value,
            400,
            r#"{"accepted":false,"state":"invalid"}"#,
        );
        return;
    }
    let Ok(report) = serde_json::from_slice::<DomainReport>(&bytes) else {
        respond(
            request,
            origin_value,
            400,
            r#"{"accepted":false,"state":"invalid"}"#,
        );
        return;
    };
    let domain = report
        .domain
        .trim()
        .trim_end_matches('.')
        .to_ascii_lowercase();
    let domain = domain.strip_prefix("www.").unwrap_or(&domain);
    let browser_name = report.browser_name.trim().to_ascii_lowercase();
    let duration_seconds = report.duration_seconds.unwrap_or(60);
    if !valid_hostname(domain)
        || !valid_browser_name(&browser_name)
        || !(1..=300).contains(&duration_seconds)
    {
        respond(
            request,
            origin_value,
            400,
            r#"{"accepted":false,"state":"invalid"}"#,
        );
        return;
    }
    match database::enqueue_website_for_active_session(
        &database,
        domain,
        &browser_name,
        duration_seconds,
    ) {
        Ok(Some(_)) => respond(
            request,
            origin_value,
            202,
            r#"{"accepted":true,"state":"queued"}"#,
        ),
        Ok(None) => respond(
            request,
            origin_value,
            409,
            r#"{"accepted":false,"state":"not-tracking"}"#,
        ),
        Err(_) => respond(
            request,
            origin_value,
            503,
            r#"{"accepted":false,"state":"unavailable"}"#,
        ),
    }
}

pub fn start(app: AppHandle) -> Result<(), String> {
    let server = Server::http(("127.0.0.1", BRIDGE_PORT)).map_err(|error| error.to_string())?;
    std::thread::Builder::new()
        .name("fieldflow-browser-bridge".to_string())
        .spawn(move || {
            for request in server.incoming_requests() {
                handle(request, &app);
            }
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{valid_browser_name, valid_hostname};

    #[test]
    fn bridge_accepts_only_hostnames_and_safe_browser_names() {
        assert!(valid_hostname("salesforce.com"));
        assert!(valid_hostname("sub.example.co.in"));
        assert!(!valid_hostname("example.com/private"));
        assert!(!valid_hostname("https://example.com"));
        assert!(!valid_hostname("example.com?token=secret"));
        assert!(valid_browser_name("chrome"));
        assert!(!valid_browser_name("chrome browser"));
    }
}
