# Employee Activity End-to-End Local Testing

Use development accounts and a development Supabase project only. Record each result; do not mark a step passed unless it was actually observed.

## 1. Prepare the database

Apply these migrations in order:

1. `supabase/migrations/202607280001_employee_activity_tracking.sql`
2. `supabase/migrations/202607280002_activity_api_functions.sql`
3. `supabase/migrations/202607290001_activity_security_hardening.sql`

Follow `EMPLOYEE_ACTIVITY_DATABASE_DEPLOYMENT.md`, then confirm:

- all eight activity tables exist;
- all four activity permissions exist;
- RLS is enabled;
- the initial monitoring policy exists and has tracking disabled;
- authenticated clients have no direct insert/update access to protected activity tables after the hardening migration.

Run the role and adversarial scenarios in `EMPLOYEE_ACTIVITY_RLS_TESTING.md`. Use separate test accounts for employee, supervised manager, unrelated manager, workforce viewer, and policy manager.

## 2. Start the web application

From the repository root:

```powershell
npm install
npm run lint
npm run build
npm run dev
```

Open <http://localhost:3000/>. Keep the terminal open so API failures can be inspected without exposing credentials.

## 3. Admin testing

Sign in with an approved account that has `activity.policies.manage` and, for workforce views, `activity.view_all`.

Open <http://localhost:3000/admin/monitoring-settings> and test:

- current policy display;
- creation of a new policy version;
- enabling tracking;
- acknowledgement requirement;
- sampling, heartbeat, idle, offline-sync, and retention settings;
- device list and device enable/revoke actions.

Policy-history, acknowledgement-summary, and audit-log read APIs are not implemented in Phase 7. The UI must show its explicit unavailable state rather than fabricated data. Record these as known limitations, not passed tests.

Open <http://localhost:3000/admin/activity> and test:

- workforce summary and date/filter behavior;
- employee drill-down;
- session timeline;
- device status;
- permission-denied behavior for an account without `activity.view_all`.

Audit-event display is not backed by an implemented read API and must be recorded as unavailable.

## 4. Employee testing

Sign in with an approved employee account granted `activity.view_self`.

Open <http://localhost:3000/employee/activity> and verify:

- the active policy is visible;
- acknowledgement works when required;
- only the employee's devices, sessions, summaries, and activity appear;
- current-session and timeline states are accurate;
- no token, device hash, typed text, key detail, clipboard data, coordinates, window title, file path, or database error appears.

Repeat with an employee without `activity.view_self` and confirm access is denied safely.

## 5. Manager testing

Sign in with an approved manager granted `activity.view_team`.

Open <http://localhost:3000/manager/activity> and verify:

- supervised employees are visible;
- unrelated employees are excluded;
- active, idle, stopped, and offline states match stored data;
- employee details, sessions, devices, summaries, and timeline are scoped to the team;
- changing an employee identifier in a request does not expose an unrelated employee.

## 6. Desktop-agent testing

Create `desktop-agent/.env.local` using non-production values described in `DESKTOP_AGENT_INSTALLATION.md`. From `desktop-agent`:

```powershell
npm install
npm run lint
npm run build
npm test
npm run tauri:dev
```

Test this sequence:

1. Log in with an approved employee account.
2. Register the Windows device.
3. View and, if required, acknowledge the current policy.
4. Start tracking and confirm the visible in-app and tray indicators.
5. Generate keyboard and mouse activity; verify only aggregate counts are uploaded.
6. Switch applications; verify only the application name is captured when policy enables it.
7. Wait past the idle threshold and verify idle reporting.
8. Lock Windows and confirm counts stop and the sample reports the locked state.
9. Disconnect the network, generate activity, and confirm samples remain in the bounded local SQLite queue.
10. Reconnect and confirm queued samples upload once without duplication.
11. Confirm heartbeat and online status updates.
12. Press Stop Tracking and confirm collection and enqueueing stop immediately.
13. Restart during an active session and verify safe session recovery.
14. Revoke the device from the admin page and confirm subsequent agent requests are rejected safely.
15. Log out and confirm tokens are removed from secure storage.

Inspect logs and SQLite only on a disposable development machine. Confirm neither contains tokens, passwords, typed content, key names/codes, clipboard data, mouse coordinates, screenshots, browser history, window titles, or full file paths.

## 7. Existing-feature regression testing

Test these existing features with their normal role accounts:

- login and signup;
- employee, manager, and admin dashboards;
- attendance and attendance management;
- attendance locations, employee location sharing, and live map;
- tasks, projects, project modules, assignments, and submissions;
- reports, expenses, and SOS;
- employee directory, clients, departments, and analytics;
- roles and permissions.

Confirm:

- the existing dashboard Live Activity card is unchanged;
- existing navigation entries still work;
- existing API routes still work;
- no existing database table or column was renamed or removed;
- attendance and location behavior is unchanged;
- no existing feature requires the desktop agent.

## 8. Failure and recovery checks

Verify safe behavior for:

- expired access token and refresh;
- disabled or unapproved profile;
- missing permission;
- disabled monitoring policy;
- missing policy acknowledgement;
- inactive/revoked device;
- cross-device and cross-session ingestion;
- oversized batch, stale/future timestamp, and malformed sample;
- duplicate local sample ID;
- API 429, temporary 5xx, network loss, sleep, and resume;
- corrupt or unavailable local SQLite database.

The current agent has no automated SQLite repair UI. Treat corruption recovery as a documented limitation and preserve evidence before replacing local agent data.

## Result record

For every test, record date, tester, account role, environment, result (`Pass`, `Fail`, or `Not run`), and evidence or issue reference. Never use production personal data for acceptance testing.
