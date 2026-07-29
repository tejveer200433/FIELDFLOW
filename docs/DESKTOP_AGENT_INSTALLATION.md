# Desktop agent installation and operation

## Windows prerequisites

- Windows 10 or 11, x64
- Node.js and npm
- Rustup, Cargo, and the stable MSVC Rust toolchain
- Microsoft C++ Build Tools with Desktop development with C++
- Microsoft Edge WebView2 Runtime

Tauri documents these in its official [Windows prerequisites](https://v2.tauri.app/start/prerequisites/). Do not install system software silently on employee devices; use the organisation's approved software-distribution process.

## Install Rust for development

```powershell
winget install --id Rustlang.Rustup
rustup default stable-msvc
rustc --version
cargo --version
```

Restart the terminal after installation. End users installing a packaged agent do not require Rust, Cargo, Node, or source code.

## Environment variables

Create `desktop-agent/.env.local` from `.env.example`:

```env
VITE_FIELDFLOW_API_URL=http://localhost:3000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_AGENT_VERSION=0.1.0
VITE_DEBUG_LOGGING=false
```

These are Vite build-time values. Create the correct environment file before building an installer. Never use a service-role key.

## Local development

Terminal 1:

```powershell
cd C:\path\to\fieldflow-nextjs
npm install
npm run dev
```

Terminal 2:

```powershell
cd C:\path\to\fieldflow-nextjs\desktop-agent
npm install
npm run tauri:dev
```

The agent opens as a native Windows window. Port 1420 is an internal Vite development origin; opening it directly in a browser does not provide native commands or secure storage.

## Build and install

```powershell
npm run lint
npm test
npm run build
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:build
```

The NSIS installer is produced under:

```text
desktop-agent/src-tauri/target/release/bundle/nsis/
```

The current installer is unsigned. Production release should use an organisation-owned code-signing certificate, protected signing credentials, timestamping, controlled CI, malware scanning, versioned artifacts, and checksum publication. Do not place certificate private keys in the repository.

## Authentication and secure storage

The employee signs in with the existing Supabase account. The password remains only in UI memory during sign-in and is cleared after success or failure. Supabase session data is chunked and stored through the Rust keyring backend in Windows Credential Manager. Logout calls Supabase sign-out and removes the credential chunks. SQLite and logs do not store tokens.

## Device registration

The agent derives an opaque hash from MachineGuid, sends that derived value to FIELD-FLOW, and the API hashes it again. Raw MachineGuid is not persisted or transmitted. Only the returned device UUID and registration time are stored locally. Pending devices must be activated by monitoring administration; revoked devices cannot collect/upload.

## Tracking controls

Tracking begins only after visible Start Tracking selection and stops through Stop Tracking. Required policy acknowledgement is unchecked by default. An in-flight sample is discarded if the session stops before enqueue. The agent refuses silent resume unless local and server session references match.

## Tray behavior

Closing the window hides it while the tray remains visible. The menu supports Open, status guidance, Start, Stop, Sync now, Sign out, and Quit. Quit while tracking opens the window and asks for confirmation.

## Offline queue and heartbeat

SQLite queues aggregate samples, caps non-uploaded rows at 10,000, recovers uploading rows, and uses exponential backoff. Heartbeats use policy intervals and are also attempted after login, start, stop, reconnection, and visible resume. A server-side interval prevents heartbeat flooding.

## Data and log locations

Tauri chooses per-user Windows application directories:

- Application data: `activity-queue.db`, WAL and shared-memory files
- Application logs: `agent.jsonl`, rotated to `agent.jsonl.1`
- Credentials: Windows Credential Manager, service `com.fieldflow.activity-agent`

Use the executable's resolved Tauri app-data/log locations during acceptance testing rather than assuming a hard-coded username path.

## Troubleshooting

| Symptom | Check |
|---|---|
| Configuration required | `.env.local` existed before build/start |
| Sign-in rejected | profile approved/active and public Supabase values match web |
| My Activity denied | role has `activity.view_self` |
| Device pending | monitoring administrator must reactivate/activate it |
| Tracking disabled | active policy has `tracking_enabled=true` |
| Acknowledgement required | acknowledge exact current policy version |
| Samples remain pending | web API online, token refresh, device/session active, retry time |
| 429 warning | wait for `Retry-After`; do not repeatedly press Sync |
| Cargo/MSVC error | stable-msvc toolchain and C++ workload installed |
| WebView error | repair/install WebView2 |

## Uninstall and offboarding

Stop tracking and sync before uninstall. The binary uninstaller does not prove that local queue, logs, or Credential Manager entries were removed. An approved offboarding procedure should:

1. Stop the session.
2. Sync or formally dispose of pending samples.
3. Sign out to clear credentials.
4. Uninstall the application.
5. Verify application data/log directories and credential entries according to retention policy.
6. Revoke the device in FIELD-FLOW.

## Known Windows limitations

- No low-level input hooks; keyboard/mouse counts remain zero.
- No automated SQLite corruption repair.
- Sleep/resume behavior requires hardware acceptance testing.
- No automatic startup configuration.
- No battery collection in the current agent.
- Installer signing is not configured.
