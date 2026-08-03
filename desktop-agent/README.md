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
6. Leave `VITE_AGENT_UPDATES_ENABLED=false` for development and unsigned builds.
7. Do not put a service-role key or updater private key in this directory.

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

## Signed automatic updates

The packaged agent can check for updates 30 seconds after startup and every six hours. Before installation it attempts to synchronize queued samples, records a restart marker in SQLite, and leaves the server tracking session active. Windows Credential Manager credentials and the SQLite queue remain in their existing application-data locations, so startup recovery can reuse the employee session, synchronize pending records, and resume the same server tracking session.

Tauri update signature verification cannot be disabled. Before producing the first update-enabled installer:

1. Generate and securely back up a password-protected Tauri updater signing key outside this repository.
2. Put only its public key into a copy of `src-tauri/tauri.updater.conf.example.json`.
3. Build with that merged Tauri configuration, `VITE_AGENT_UPDATES_ENABLED=true`, and the signing-key environment variables.
4. Publish the generated NSIS artifact and `.sig`, then configure the FieldFlow server-only release environment values.

Never commit the private signing key, its password, or a signed release secret. Losing the private key prevents publishing trusted updates to already-installed agents.

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

The agent queues at most 10,000 non-uploaded samples. Queue reads are restricted to each sample's original tracking session, so a later session cannot claim earlier offline samples. Uploading rows return to pending after restart. Transient failures use exponential backoff; HTTP 429 honors `Retry-After`. Permanently rejected samples remain local for diagnosis without infinite retry. Uploaded confirmations are retained for approximately 24 hours and pruned during successful sync.

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

- Windows desktop agent only; domain collection additionally requires the managed cross-browser extension.
- Keyboard key-down and mouse activity counts are collected only as aggregate counters during an explicit tracking session.
- Samples belonging to an already-ended session remain preserved locally until the FIELD-FLOW API supports bounded ended-session ingestion.
- Sleep/resume relies on webview visibility/network events and needs device acceptance testing.
- SQLite corruption has no automated repair UI.
- Last-sync UI state is not persisted across restart.
- The installer is unsigned.
- Automatic updates remain disabled until the first signing key, public updater configuration, and signed release are created.
- The API limiter is process-local.
- Server daily-summary generation and retention scheduling are not implemented.

## Input safety decision

This version installs Windows low-level keyboard and mouse notification hooks, but the callbacks never inspect the event-detail structures. They increment only in-memory aggregate counters while an explicit tracking session is active. Key identities, key codes, typed content, mouse buttons, coordinates, paths, and click targets are never retained, logged, placed in SQLite, or transmitted.

## Windows startup and recovery

Packaged production builds register the agent to start automatically at Windows sign-in. Auto-start launches it minimized with a visible system-tray icon. After the employee signs in and accepts the monitoring policy once, the securely stored session is reused. If both the server and local state identify the same active tracking session, collection resumes automatically. Pending samples are synchronized at startup, after reconnecting, on manual sync, and before and after stopping.

The agent also uses the official Windows `GetLastInputInfo` API to calculate time since the last user input. Aggregate counters reset when tracking starts, when a sample reads them, and when tracking stops.

Application collection, when enabled by policy, records only the foreground executable filename stem (for example `chrome`). It excludes the window title, document name, URL, full executable path, command line, and username.

See [PRIVACY.md](PRIVACY.md) for the full data boundary.
