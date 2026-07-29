# FIELD-FLOW desktop agent local testing

## Prerequisites

Confirm `node`, `npm`, `rustc`, `cargo`, Microsoft C++ Build Tools, and WebView2 are installed. The desktop agent will not install system prerequisites.

## Configure and start

1. From the repository root, copy the existing web environment configuration as normal and run `npm run dev`.
2. Confirm FIELD-FLOW is available at `http://localhost:3000`.
3. Apply the approved Phase 1 and Phase 2 Supabase migrations if they are not already applied.
4. Confirm the employee role includes `activity.view_self`.
5. Copy `desktop-agent/.env.example` to `desktop-agent/.env.local`.
6. Put the existing public Supabase URL and anonymous key in the desktop environment file. Never use the service-role key.
7. Set `VITE_FIELDFLOW_API_URL=http://localhost:3000`.
8. From `desktop-agent`, run `npm install`, then `npm run tauri:dev`.

## Manual verification

1. Sign in with an approved, active employee account.
2. Confirm a company device is registered once and the returned device UUID is reused after restart.
3. Confirm the dashboard shows the device name, Windows version, agent version, registration state, and active monitoring policy.
4. If acknowledgement is required, confirm the checkbox starts clear and Start Tracking is unavailable until acknowledgement succeeds.
5. Press Start Tracking and confirm the visible status changes to Tracking.
6. Confirm the elapsed session timer advances and the tray icon remains visible.
7. Use the keyboard and mouse normally, then inspect the local database and server sample: this safe fallback build must report aggregate keyboard and mouse counts as `0`; it must contain no key names, key codes, typed text, mouse coordinates, or clicked elements.
8. Wait past the policy idle threshold and confirm status becomes Idle.
9. Switch applications and confirm only the sanitized executable name appears when application-name collection is enabled. Confirm no title, URL, document name, path, command line, or username appears.
10. Lock Windows, wait for a sample, then unlock and confirm the sample contains only `screenLocked: true` for lock state.
11. Disconnect the network and confirm pending samples remain in the local SQLite queue.
12. Reconnect and press Sync now or wait for the policy upload interval. Confirm accepted/duplicate samples become uploaded and rejected samples remain available for diagnosis without endless retries.
13. Confirm heartbeat records appear at the configured interval and immediately after login, start, and stop.
14. Press Stop Tracking and confirm sampling stops immediately.
15. Restart the agent. Confirm rows left in `uploading` recover to `pending`.
16. Confirm an active session resumes only when the saved local session ID and server active session ID match; otherwise the agent does not silently resume.
17. Revoke the device from FIELD-FLOW, then confirm start/upload receives a clear revoked-device error and no replacement device is silently created.
18. Sign out and confirm monitoring and uploads stop and Windows Credential Manager no longer contains the Supabase session entry.
19. Quit while tracking and confirm the agent asks before stopping and quitting.

## Privacy inspection

The SQLite database is stored in the Tauri application data directory as `activity-queue.db`. Inspect its schema and rows with a SQLite viewer. It must not contain:

- Passwords
- Access or refresh tokens
- Raw MachineGuid or another raw hardware identifier
- Email addresses or Windows usernames
- Typed characters, key names, key codes, or scan codes
- Clipboard content
- Screenshots
- URLs, browser history, window titles, full file paths, or mouse coordinates

Supabase tokens must exist only in Windows Credential Manager under the service name `com.fieldflow.activity-agent`.

## Regression checks

Run from the repository root:

```powershell
npm run lint
npm run build
```

Verify the existing employee, manager, and admin dashboards and all attendance, location, task, project, report, expense, SOS, authentication, and RBAC flows behave exactly as before. The desktop agent is separate from attendance and location sharing.

## Known limitation

Low-level Windows keyboard and mouse hooks are intentionally absent because they would expose key codes, button identities, or coordinates to the process. This build uses `GetLastInputInfo` for idle duration and reports keyboard and mouse event counts as zero.
