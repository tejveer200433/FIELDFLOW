# Employee activity tracking architecture

## 1. System overview

Employee activity tracking is an additive subsystem inside FIELD-FLOW. Existing authentication, dynamic RBAC, attendance, location sharing, live maps, tasks, projects, reports, expenses, SOS, analytics, and dashboards remain separate.

```text
Desktop Agent
    ↓
Activity APIs (/api/activity/*)
    ↓
Supabase tables, functions, grants and RLS
    ↓
Employee, Manager and Admin activity pages
```

The browser pages display and administer activity data. A browser cannot reliably or safely perform system-wide Windows idle, foreground-application, lock-state, or offline collection. Those responsibilities belong to the visible Windows desktop agent.

## 2. Data flow

1. An approved employee authenticates with the existing Supabase project.
2. The desktop agent verifies `activity.view_self`.
3. The agent registers an opaque device identifier through the FIELD-FLOW API.
4. The employee sees and, when required, acknowledges the active policy.
5. The employee explicitly starts a tracking session.
6. The agent creates policy-timed aggregate samples and stores them in local SQLite.
7. The agent uploads batches of at most 100 samples and sends policy-timed heartbeats.
8. Supabase functions derive employee identity from `auth.uid()`, enforce ownership and policy state, and store activity rows.
9. RLS scopes reads to self, supervised team, workforce, or monitoring administration.
10. Employee, manager, and admin pages read only through authenticated activity APIs.

## 3. Web application responsibilities

- Authenticate requests with the existing Bearer-token flow.
- Reject inactive, disabled, pending, or unapproved profiles.
- Resolve existing dynamic permissions and Owner semantics.
- Validate all activity request bodies and query parameters.
- Enforce API batch, timestamp, ownership, policy, acknowledgement, and rate-limit rules.
- Return mapped records that omit device hashes and database-only fields.
- Provide separate My Activity, Team Activity, Workforce Activity, and Monitoring Settings pages.

The web application does not capture operating-system activity.

## 4. Desktop-agent responsibilities

- Use the existing public Supabase configuration and employee credentials.
- Store Supabase session data through Windows Credential Manager.
- Register and remember only the server-issued device UUID.
- Show policy and acknowledgement requirements.
- Start and stop collection only through explicit employee controls.
- Read Windows idle duration, lock state, and a sanitized executable name.
- Maintain a bounded local SQLite queue and upload in idempotent batches.
- Keep a visible application window and tray icon.
- Send lifecycle and scheduled heartbeats.

The current safe fallback does not install input hooks, so keyboard and mouse counts are always zero.

## 5. Supabase responsibilities

Supabase provides:

- Existing authentication and profiles.
- Existing dynamic roles, permissions, team-supervision functions, and Owner semantics.
- Eight activity tables with RLS.
- Transactional functions for device, session, acknowledgement, heartbeat, policy, audit, and ingestion writes.
- Foreign keys that bind employees, devices, sessions, and samples.
- Append-only boundaries for samples, acknowledgements, heartbeats, summaries, and audit logs.

The current design assumes one FIELD-FLOW organisation per Supabase project.

## 6. Authentication flow

The agent calls Supabase `signInWithPassword` using the public anonymous key. It never stores the password. It then reads the employee profile and `get_my_access_context`. The web API independently validates the Bearer token with Supabase, loads the profile, verifies approval and active status, and resolves dynamic permissions. Request bodies cannot choose employee, manager, role, or permission scope.

## 7. Device registration flow

The Windows native layer reads MachineGuid and derives an application-specific SHA-256 value. The raw MachineGuid never leaves the Rust function. The API hashes the opaque value again and passes only the second hash to `activity_register_device`. The database returns an existing non-revoked device for the same employee or creates a pending device. The agent persists only the returned UUID and registration timestamp.

Pending devices require monitoring administration before tracking. Revoked devices cannot ingest or heartbeat.

## 8. Policy acknowledgement flow

`GET /api/activity/policies` returns the active policy and the signed-in employee's acknowledgement state. When required, the agent displays policy text with an unchecked checkbox. It hashes the exact displayed text and posts the policy ID, version, and hash. The database records an append-only acknowledgement for `auth.uid()` and the exact active version.

## 9. Tracking-session flow

Start is explicit. `activity_start_session` verifies:

- `activity.view_self`;
- an active owned device;
- active policy and tracking enabled;
- required acknowledgement;
- no existing active employee session;
- optional project/task assignment.

Stop updates only the caller's active session with database time. Restart recovery resumes monitoring only when the server session and saved local session reference match.

## 10. Sampling flow

The agent samples at `sample_interval_seconds`, prevents overlapping executions, and uses UTC timestamps and idempotent local IDs. Each sample can contain only aggregate counts, idle seconds, optional application name, and lock state. When locked, input counts are zero and application lookup is skipped. Sampling stops when the React session state is cleared.

## 11. Heartbeat flow

Heartbeats include device ID, optional session ID, agent version, online state, and optional battery level. The database uses its own timestamp, verifies device/session ownership, prevents excessive frequency, and updates device last-seen time in the same transaction.

## 12. Offline queue and retry flow

SQLite uses WAL mode. Rows move through `pending`, `uploading`, `uploaded`, or `failed`. Startup recovers rows left in `uploading`. Network and rate-limit failures use bounded exponential backoff and respect `Retry-After`. Permanently rejected samples remain marked failed for diagnosis and are not retried forever. The queue stops accepting new rows at 10,000 rather than silently deleting pending data.

## 13. Manager access flow

`activity.view_team` resolves employee UUIDs through the existing team-supervision relationship. API queries and RLS independently restrict access to supervised employees. A manager cannot expand scope by supplying another employee ID.

## 14. Admin access flow

`activity.view_all` reads workforce data. `activity.policies.manage` controls policy version creation and device administration. These permissions are independent. Owner access follows the existing protected Owner semantics. Policy history, acknowledgement summaries, and audit-log read endpoints are not implemented; their UI areas report that limitation instead of bypassing the API.

## 15. Data-retention flow

The active policy stores `retention_days`, but no server-side cleanup scheduler is implemented. The local agent retains uploaded confirmations for approximately 24 hours and prunes them during successful sync. Server retention requires a separately approved scheduled database job.

## 16. Audit-log flow

Security-definer functions record safe lifecycle and administration metadata. Audit rows are append-only to ordinary clients. The hardening migration also rejects recursively nested sensitive metadata keys.

## 17. Failure and recovery behavior

- Missing/expired tokens require sign-in or token refresh.
- Offline samples remain queued.
- Rows stuck uploading recover on restart.
- Duplicate sample IDs are acknowledged idempotently.
- Invalid or expired samples become permanent local failures.
- Revoked/pending devices are rejected.
- Policy disablement prevents new sessions and ingestion.
- A server session without matching local resume state is not silently resumed.
- Database corruption currently prevents native startup rather than opening a recovery UI.
- Process-local API rate limits are not shared across multiple Next.js instances.
