# Desktop agent security review

Review date: 2026-07-29.

## Results

| Check | Result | Notes |
|---|---|---|
| Password never persisted/logged | Pass | Password is UI state only and is cleared after success/failure |
| Access/refresh tokens stored securely | Pass by design | Supabase storage adapter uses Windows Credential Manager via native keyring |
| Tokens cleared on logout | Pass by code review | Supabase sign-out invokes secure storage removal |
| Raw device identifier not persisted | Pass | MachineGuid is hashed in Rust; only derived value leaves function; SQLite stores server UUID |
| Actual keystrokes/key names/key codes | Pass | No hooks or Raw Input; counters remain zero |
| Clipboard, browser history, window titles, file paths, mouse coordinates | Pass | No collection API, field, SQLite column, or payload |
| Screenshots | Pass by design | Off by default; capture gated by policy + an on-device exclude-list check before any capture API call; server independently re-validates policy state and the exclude list before accepting an upload; local file deleted on upload confirmation or permanent rejection |
| Tokens absent from SQLite/logs | Pass | SQLite model has no credential fields; logs accept only fixed event names |
| Stop/logout collection boundary | Pass after Phase 7 fix | Session ref prevents an in-flight sample from queueing after Stop |
| Locked-state pause | Pass after Phase 7 fix | Locked samples skip input-counter and application commands |
| Tracking visible | Pass | Window status plus persistent tray |
| Offline queue bounded | Pass | 10,000 non-uploaded row maximum, no silent discard |
| Permanent failures stop retrying | Pass | Server rejections set `permanent_failure=1` |
| Rate limits respected | Pass | Client reads `Retry-After`; local queue schedules later retry |
| Sleep/resume | Partial | Visibility/network events trigger heartbeat; native power-event coverage is not implemented |

## Security design

- Public Supabase configuration only; no service-role key.
- Bearer token refresh occurs before activity API calls.
- Credential values are chunked to stay within Windows credential-size limits.
- The stable device identifier is application-specific and double-hashed by the API.
- Active application output is executable filename stem only, sanitized and limited to 120 characters.
- SQLite uses parameterized queries and a fixed schema.
- Dynamic SQL is used only for an `IN` placeholder count derived from an internal vector length.
- Logs rotate at 1 MiB and contain no free-form metadata.
- Tauri CSP permits required HTTPS and local-development connections; production should narrow allowed origins to deployed endpoints.

## Fixes made during Phase 7

- Locked sampling no longer queries input counts or foreground application.
- Password state is cleared after failed login.
- An in-flight sample checks the active session immediately before enqueue.
- Agent version/debug environment names now match deployment documentation.

## Remaining limitations

- Secure credential behavior was compiled and code-reviewed but still requires a real login/logout inspection in Windows Credential Manager.
- Sleep, hibernate, session switch, and shutdown require hardware end-to-end testing.
- SQLite corruption causes native startup failure; there is no read-only export/recovery UI.
- A locally privileged user can inspect or alter their own process and application files; code signing and endpoint monitoring are not configured.
- The installer is unsigned.
- Closing the window leaves the tray agent running by design; employee training must make that behavior clear.
- Local uploaded rows are pruned only during a later successful sync.
- Uninstall does not implement an automatic data/credential erasure workflow.
- This is not a penetration test, malware analysis, or legal compliance certification.
