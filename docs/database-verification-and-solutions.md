# Database verification and solutions

Verified on 11 September 2026 against `lespxxumxpiqxuekrcoo.supabase.co`, the project configured in `.env.local`. Requests used the existing publishable key and GET only. No database records, policies, or configuration were changed.

## Live results

- The Supabase authentication health endpoint returned HTTP 200.
- Probed the 65 public tables named by the repository's migrations: 37 zero-row schema requests succeeded and 28 were denied to the anonymous role. No missing-table errors were returned. Permission denials are expected for protected tables, not application defects.
- Of 17 selected column checks, 10 succeeded and seven returned PostgreSQL error `42703` (undefined column).
- All seven missing columns belong to `employee_devices`: `agent_mode`, `employee_sign_out_allowed`, `employee_quit_allowed`, `auto_start_tracking`, `recovery_enabled`, `managed_at`, and `managed_by`.
- Attendance capture timestamps, attendance event identifiers, `worked_minutes`, `risk_flags`, profile `avatar_path`, and task archive/recurrence/estimate columns passed the targeted checks.
- Anonymous one-row requests exposed no profile, expense, daily-report, or attendance IDs. Device access was denied. Empty results do not establish that RLS is correct; tables could be empty and authenticated policies can differ.
- The REST schema endpoint requires a secret key. The browser dashboard is signed out. Deployed policy definitions, grants, triggers, SQL function bodies, and migration history remain unverified.

The exact responses are saved in `database-verification-results.json`. The reusable probe is `../scripts/verify-database-readonly.mjs`.

## 1. Confirmed high-priority schema mismatch

The current `src/backend/activity/data.js` includes all seven missing columns in `deviceSelect`. The database rejects the SELECT before JavaScript's default values in `mapDevice` can run.

Affected code paths include the device list, employee activity details, the current session when one exists, heartbeat handling, activity ingestion, and device-specific web-access policy reads. Authenticated requests reaching these SELECTs will fail; the API's generic database error handler maps that failure to HTTP 500. This impact is inferred from the verified database error and the current source; authenticated routes were not exercised.

### Solution

1. Inspect the deployed definitions using `database-verification-readonly.sql`, including prerequisites `has_permission`, `is_owner`, and `activity_write_audit_log`.
2. Apply the existing `../supabase/migrations/202608310001_corporate_agent_management.sql` through the project's normal migration process before deploying the current application code. It adds the seven columns, supporting index, and administrator-controlled management function. Its defaults leave existing devices in standard mode.
3. Include this migration in version control and the release: it was an untracked file when checked. Do not assume local migration files have been applied remotely.
4. Rerun `node scripts/verify-database-readonly.mjs`. The seven `42703` errors must disappear. An anonymous permission denial afterward is expected and is not a reason to broaden grants.
5. With an authorized test employee/device, verify device listing, an active-session read, heartbeat, and activity upload. With a monitoring administrator, verify management changes and their audit entry.

If a database deployment must wait, use an application release compatible with the existing schema. Do not silently present corporate controls as available while the management columns/function are missing.

## 2. Approval bypass: source finding, pending live confirmation

The repository's `reports_rbac_insert` and `expenses_rbac_insert` policies check ownership and submission permission but do not constrain inserted status or review fields. A directly authenticated Supabase client could insert an already-approved submission if the live database has these rules and no additional column privileges, restrictive policies, or triggers prevent it.

### Solution if confirmed

Enforce initial state inside the database: reports must start as `Submitted`, expenses as `Pending`, and `reviewed_by`, `reviewed_at`, and `manager_comment` must be null at insertion. Inspect every applicable policy because permissive policies can provide another allowed path. Use a restrictive INSERT policy or a validating trigger, and preserve separately authorized manager review updates. Validate with dedicated employee and manager accounts in a disposable database before release. A service-role client is not a valid test of employee RLS.

Do not describe this as a verified production vulnerability until the deployed policies, grants, and triggers have been inspected.

## 3. Offline attendance timing: source finding, pending function inspection

The live database contains the capture metadata columns. That proves column availability, not how the deployed functions use them. The local functions assign attendance time using `now()` and store the captured time separately; this would misstate delayed offline events if the same functions are deployed.

### Solution if confirmed

Use one transactional attendance ingestion function that derives the employee from `auth.uid()`, accepts a stable event ID and validated capture time, records both capture and receipt timestamps, and performs deduplication and attendance changes atomically. Validate the 24-hour window, event ordering, shift, leave, and location rules for the appropriate event time. If offline timestamps require managerial trust, retain them as pending corrections rather than automatically treating synchronization time as worked time. Define how delayed checkout interacts with an automatically closed shift; do not blindly overwrite existing attendance.

## 4. Browser queue problems: confirmed locally, not solved by SQL alone

- **Account isolation:** store events under a user-specific key with the originating employee ID. Flush only when that user is authenticated. Quarantine legacy events whose owner cannot be established; never submit them under the next signed-in employee.
- **Retry identity:** construct an event once and preserve its event ID and original capture time across network retries. The API must return the original result for a duplicate event.
- **Permanent failures:** distinguish retryable network/server failures from expired or invalid events. Retain rejected events in a visible recovery list and avoid retrying them forever. Pause dependent events from the same shift for reconciliation while allowing unrelated valid events to proceed.
- **Concurrent flushes:** serialize flushing and remove only acknowledged event IDs from the latest queue, so events added during synchronization are not lost.

The first three issues were reproduced in local isolated JavaScript checks during the initial review. Database access neither confirms nor fixes browser identity handling.

## Remaining access needed

Sign in to the Supabase dashboard already opened for this project. Then the read-only SQL in `database-verification-readonly.sql` can establish the deployed RLS, grants, triggers, function bodies, and migration history. Until then, the schema mismatch above is confirmed; the production approval and timing findings remain conditional.
