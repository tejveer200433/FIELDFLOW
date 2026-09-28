# FieldFlow

A field-workforce management platform for companies whose staff work off-site. One role-based system covering attendance, live location, tasks, expenses, and consent-based activity monitoring — across web, Windows, and Android.

**Live:** https://fieldflow-henna.vercel.app

---

## The problem

Companies with distributed or field-based staff usually can't answer four basic questions from one place: who is on shift, where are they, what are they working on, and did the billable work actually happen.

The usual answer is four products — an attendance app, a task tracker, an expense tool, and a monitoring agent — each with its own login, its own permission model, and no shared audit trail. FieldFlow merges them behind a single dynamic RBAC system, with policy enforced in the database rather than the client.

## Who uses it

Three role-scoped workspaces share one authentication and permission system.

| Role | What they do |
| --- | --- |
| **Employee** | Clock in/out, share live location during a shift, work assigned tasks, submit reports and expense receipts, review their own activity data, raise an SOS |
| **Manager** | Approve attendance and expenses, assign and track tasks, watch the team live map, review team activity, decide website-access requests |
| **Admin** | Manage employees, clients, departments, dynamic roles and permissions, monitoring policy, and device activation/revocation |

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, JavaScript, Tailwind CSS |
| Backend | Next.js API routes (~55) over Supabase |
| Database | Supabase Postgres — 44 migrations, row-level security on every table, business logic in `SECURITY DEFINER` RPCs |
| Auth | Supabase Auth (email/password, confirmation, recovery, session persistence) + dynamic permission resolution |
| Maps | Leaflet / react-leaflet |
| Charts | Recharts |
| Documents | pdfjs-dist, sharp (receipt and report processing) |
| Desktop agent | Tauri 2 — Rust core, React UI, local SQLite queue, signed auto-updater |
| Android agent | Native Java, API 26+ targeting API 36, Android Keystore AES-GCM, MediaProjection — no Play Services dependency |
| Browser extension | Chrome MV3 (web-access enforcement) |
| Hosting | Vercel |

Roughly 217 source files and 33 test suites across the web app and the two agents.

## Features

### 1. Dynamic RBAC

Permissions are database rows, not hardcoded enums. Admins compose roles at runtime, and the same permission context is resolved by every API route *and* every RLS policy — so a role change takes effect immediately across web, desktop, and Android, with no deploy and no client-side trust.

### 2. Attendance and live location

Shift check-in/out with a schedule calendar, timesheet export, and attendance insights. GPS fixes are written only while a shift is open. Managers get a live team map with a two-minute staleness timeout. Location sharing is employee-initiated and stops when the shift does.

### 3. Consent-based activity monitoring

A Tauri/Rust Windows agent and a native Android app collect **aggregate** activity — idle time, foreground application, lock state, battery — into an encrypted local queue, syncing in batches of at most 100 samples with stable IDs for retry deduplication.

Every layer fails closed:

- the employee must explicitly acknowledge the active monitoring policy;
- the device must be activated by an admin before it can send anything;
- only one tracking session can be live per employee across all their devices;
- policy validation that fails for two minutes pauses collection;
- screenshots require explicit OS-level consent per session and are never persisted on the device.

The agents are visibly running, stoppable by the employee, and do not attempt to hide, prevent uninstall, or bypass OS capture consent. See [`docs/EMPLOYEE_ACTIVITY_PRIVACY_MODEL.md`](docs/EMPLOYEE_ACTIVITY_PRIVACY_MODEL.md).

### 4. Web and application access control

Policies scope to organisation, team, role, employee, or device, with category, domain, weekday, time, and timezone rules. Employees request access; managers approve for a shift, a project, seven days, or permanently; approvals ship down on the next heartbeat. Extension-health heartbeats alert managers if the extension is removed or disabled.

Only domain names, executable names, event type, device, and timestamp are recorded — never URLs, page titles, keystrokes, clipboard data, or message content. See [`docs/WEB_ACCESS_CONTROL.md`](docs/WEB_ACCESS_CONTROL.md).

### 5. AI employee guide

A schema-constrained assistant with a strict JSON response contract, a navigation allow-list, and a 12-requests-per-minute per-user limit, so it can only ever suggest routes that exist. Disabled by default; falls back to deterministic guidance unless `FIELDFLOW_AI_ENABLED` is set.

## Run locally

```bash
npm install
cp .env.example .env.local   # add your Supabase URL and anon key
npm run dev
```

Open http://localhost:3000.

Apply the migrations in [`supabase/migrations/`](supabase/migrations/) to your Supabase project in filename order. Add your deployed URL and `/reset-password` to the allowed redirect URLs in Supabase Authentication settings.

Tests run on the Node test runner:

```bash
node --test tests/*.mjs tests/activity/*.mjs
cd desktop-agent && npm test
```

## Routes

- **Auth** — `/login/[role]`, `/signup/[role]`, `/reset-password`
- **Employee** — `/employee` (tasks, attendance, reports, expenses), `/employee/activity`
- **Manager** — `/manager` (tasks, employees, map, analytics), `/manager/activity`
- **Admin** — `/admin` (employees, clients, departments, roles, settings), `/admin/activity`, `/admin/monitoring-settings`
- **Public** — `/privacy/website-activity`

## Environment

See [`.env.example`](.env.example). `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are required. The service-role key is server-only and needed solely for admin-created user invitations. AI and signed agent-release variables are optional and unset by default.

## Documentation

Architecture, privacy model, permission matrix, retention policy, and testing checklists are in [`docs/`](docs/). Start with [`EMPLOYEE_ACTIVITY_TRACKING_ARCHITECTURE.md`](docs/EMPLOYEE_ACTIVITY_TRACKING_ARCHITECTURE.md) and [`EMPLOYEE_ACTIVITY_PRIVACY_MODEL.md`](docs/EMPLOYEE_ACTIVITY_PRIVACY_MODEL.md). Agent-specific notes live in [`desktop-agent/README.md`](desktop-agent/README.md) and [`android-agent/README.md`](android-agent/README.md).

## Status

Production deployment on Vercel against a live Supabase project. The Android agent is a test build: it runs on Android 8.0+ but has not been certified on every device. Manufacturer battery controls and OS permissions affect agent operation.
