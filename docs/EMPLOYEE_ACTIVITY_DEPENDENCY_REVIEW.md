# Employee activity dependency review

Review date: 2026-07-29.

## Root web application

`package.json` contains no dependency added specifically for employee activity tracking. The activity web feature reuses Next.js, React, Supabase, Lucide, and existing application helpers. No root dependency update was required by Phase 7.

The root lockfile was not regenerated during activity implementation.

## Desktop JavaScript dependencies

Production:

- `@supabase/supabase-js`: existing authentication/API client ecosystem
- `@tauri-apps/api`: native command/event bridge
- `react`, `react-dom`: familiar UI layer

Development:

- Tauri CLI, Vite and React plugin
- ESLint and focused React lint plugins

No Electron runtime was added. No HTTP, SQLite, token-storage, retry, or logging convenience package was added where the platform/native code already handled it.

## Rust dependencies

- `tauri`: Windows application and tray
- `keyring`: Windows Credential Manager
- `rusqlite` with bundled SQLite: bounded offline queue
- `windows`: official Windows API bindings
- `serde`/`serde_json`: command and safe log serialization
- `chrono`: UTC timestamps/backoff
- `sha2`/`hex`: opaque device identifier
- `uuid`: local sample identifiers

Bundled SQLite increases binary/build size but avoids relying on an unknown system SQLite installation. Windows bindings are feature-limited to the APIs used.

## Lock files

- Root `package-lock.json`: existing
- `desktop-agent/package-lock.json`: desktop npm resolution
- `desktop-agent/src-tauri/Cargo.lock`: reproducible Rust application resolution

Application lockfiles should remain committed once the user approves Git operations. Do not hand-edit them.

## Installation scripts and audit

No project-defined `preinstall`, `install`, or `postinstall` script exists in either package manifest. Transitive packages may use their normal build/install mechanisms; review lockfile and CI logs for release builds.

On 2026-07-29, clean `npm install --ignore-scripts` checks reported:

- Root: 12 high-severity advisories in the complete tree.
- Root production-only audit: 3 high-severity advisories through the current Next.js dependency chain (`postcss` and `sharp`).
- Desktop: 6 high-severity advisories in development tooling.
- Desktop production-only audit: 0 vulnerabilities.

The reported root automatic remedy would make a breaking Next.js version change. No `npm audit fix` or forced upgrade was run. These advisories must be handled as a separate dependency-maintenance task with full regression testing. The desktop development advisories do not ship in the production frontend bundle, but should also be monitored and updated deliberately.

Cargo compiled from its lockfile and passed strict Clippy/tests. `cargo audit` is not installed and was not run.

## Conclusions

- No unrelated root upgrade
- No forced audit fix
- No production secret in manifests or lockfiles
- No service-role package/configuration
- No dependency added solely for convenience
- Tauri is the only desktop runtime
- Future dependency upgrades require separate regression testing
