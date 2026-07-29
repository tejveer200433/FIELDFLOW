# FieldFlow Activity Agent

This directory is an additive Windows desktop companion for the existing FIELD-FLOW application. It does not replace or modify the web application, authentication, dynamic RBAC, attendance, location sharing, dashboards, APIs, or database migrations.

## Prerequisites

- Windows 10/11
- Node.js and npm
- Rust MSVC toolchain (`rustup`, `rustc`, and `cargo`)
- Microsoft C++ Build Tools with the Desktop development with C++ workload
- Microsoft Edge WebView2 Runtime

The repository does not install these system prerequisites automatically.

## Configure

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_FIELDFLOW_API_URL` to the existing FIELD-FLOW web origin.
3. Use the same public Supabase URL and anonymous key as the web application.
4. Set `VITE_AGENT_VERSION` to the packaged agent version.
5. Leave `VITE_DEBUG_LOGGING=false` unless diagnosing a development issue.
6. Do not put a service-role key in this directory.

For local web development, `VITE_FIELDFLOW_API_URL=http://localhost:3000`.

## Develop

```powershell
cd desktop-agent
npm install
npm run tauri:dev
```

The Vite-only command (`npm run dev`) can render the frontend, but authentication storage and native monitoring commands require the Tauri runtime.

## Validate and package

```powershell
npm run lint
npm test
npm run build
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri:build
```

The Tauri build produces a Windows NSIS installer beneath `src-tauri/target/release/bundle/nsis`.

The installer is not code-signed. Windows may show an unknown-publisher warning. Production distribution requires an organisation-controlled signing certificate and release process.

## Architecture

- React/Vite provides sign-in, policy consent, explicit tracking controls, status, and sync visibility.
- Supabase authentication uses the existing project and existing employee profile/RBAC functions.
- Session tokens are stored through the native keyring integration backed by Windows Credential Manager. They are never stored in SQLite.
- The native layer derives a stable opaque SHA-256 device identifier from Windows MachineGuid. MachineGuid is never logged, persisted by the agent, or sent over the network.
- Only the server-returned device UUID is stored in the local `agent_state` table.
- SQLite stores pending activity samples and retry metadata using WAL mode. Upload batches are limited to 100 samples.
- The system tray can open the agent or request explicit start, stop, and confirmed quit actions.

## Operation

1. Start the existing FIELD-FLOW web server.
2. Launch the agent and sign in with an approved employee account.
3. Register the device and wait for monitoring administration to activate it.
4. Review and acknowledge the active policy when required.
5. Select **Start tracking**. Tracking never starts automatically on first installation.
6. Use **Sync now** or wait for the policy upload interval.
7. Select **Stop tracking** before signing out.

Closing the window hides it while keeping the visible tray icon. Tray actions open the agent, start, stop, sync, sign out, or request confirmed quit.

## Local data

- SQLite: Tauri application-data directory, `activity-queue.db`
- Rotated logs: Tauri application-log directory, `agent.jsonl` and at most one `agent.jsonl.1`
- Supabase session: Windows Credential Manager service `com.fieldflow.activity-agent`

Logs contain only allow-listed lifecycle event names, timestamps, and levels. They do not include emails, tokens, passwords, samples, or device identifiers.

## Offline and recovery

The agent queues at most 10,000 non-uploaded samples. Uploading rows return to pending after restart. Transient failures use exponential backoff; HTTP 429 honors `Retry-After`. Permanently rejected samples remain local for diagnosis without infinite retry. Uploaded confirmations are retained for approximately 24 hours and pruned during successful sync.

## Troubleshooting

- **Configuration required:** create `.env.local` before `tauri:dev` or `tauri:build`.
- **Permission denied:** ensure the employee is approved, active, and has `activity.view_self`.
- **Device not active:** activate the pending device from Monitoring Settings.
- **Acknowledgement required:** accept the exact active policy version.
- **Tracking disabled:** an authorised administrator must create an enabled policy version.
- **Heartbeat too frequent:** wait for the returned retry interval.
- **Cargo not found:** restart the terminal after installing Rust and run `rustup default stable-msvc`.
- **Database startup failure:** preserve the application-data directory and inspect the error before replacing SQLite; pending samples must not be silently discarded.

## Uninstall

The NSIS uninstaller removes application binaries. Treat the Tauri application-data/log directories and Windows Credential Manager entries as user data: verify and remove them through an approved offboarding process after ensuring no pending samples require recovery. Uninstalling while offline may leave unsynchronised SQLite rows.

## Known limitations

- Windows only; no browser extension or mobile agent.
- Keyboard and mouse counts are zero under the no-hook safety decision.
- Sleep/resume relies on webview visibility/network events and needs device acceptance testing.
- SQLite corruption has no automated repair UI.
- Last-sync UI state is not persisted across restart.
- The installer is unsigned.
- The API limiter is process-local.
- Server daily-summary generation and retention scheduling are not implemented.

## Input safety decision

This version intentionally does not install low-level keyboard hooks, Raw Input listeners, mouse hooks, or accessibility listeners. Those Windows APIs expose key codes, mouse-button identities, or pointer coordinates to the process, even if a later step discards them.

The agent uses the official Windows `GetLastInputInfo` API only to calculate time since the last user input. Keyboard and mouse event counts therefore remain `0` under the safe fallback rule. No typed content, key names, key codes, mouse coordinates, or raw input events enter process memory, logs, SQLite, or network payloads.

Application collection, when enabled by policy, records only the foreground executable filename stem (for example `chrome`). It excludes the window title, document name, URL, full executable path, command line, and username.

See [PRIVACY.md](PRIVACY.md) for the full data boundary.
