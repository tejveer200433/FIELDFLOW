# Employee Activity Acceptance Checklist

Mark an item only after observing it in the target development environment.

## Database

- [ ] All three activity migrations applied in order
- [ ] Eight activity tables present
- [ ] Four activity permissions present
- [ ] RLS enabled on every activity table
- [ ] Default monitoring policy present
- [ ] Monitoring disabled by default
- [ ] Direct authenticated writes revoked as documented
- [ ] Employee, manager, workforce, and policy-manager RLS tests passed

## Employee

- [ ] My Activity is accessible with `activity.view_self`
- [ ] Policy acknowledgement works
- [ ] Employee can see only their own data
- [ ] Session controls work
- [ ] Device and session states are accurate
- [ ] Summary and timeline load safely
- [ ] Sensitive data is absent from UI and responses

## Manager

- [ ] Team Activity is accessible with `activity.view_team`
- [ ] Only supervised employees are visible
- [ ] Unrelated employee requests are rejected
- [ ] Active, idle, stopped, and offline statuses are correct
- [ ] Employee detail and timeline work

## Admin

- [ ] Workforce Activity is accessible with `activity.view_all`
- [ ] Monitoring Settings is accessible with `activity.policies.manage`
- [ ] Policy versioning works
- [ ] Device enable/revoke administration works
- [ ] Policy-history limitation is shown honestly
- [ ] Acknowledgement-summary limitation is shown honestly
- [ ] Audit-log read limitation is shown honestly
- [ ] Audit-log metadata contains no sensitive values

## Desktop agent

- [ ] Login works
- [ ] Password is not stored or logged
- [ ] Access and refresh tokens use secure storage
- [ ] Device registration works
- [ ] Start and Stop Tracking work
- [ ] Collection stops after Stop and logout
- [ ] Idle detection works
- [ ] Only aggregate keyboard and mouse counts are collected
- [ ] Active application collection follows policy
- [ ] Screen lock pauses input collection
- [ ] Offline queue is bounded and later synchronizes
- [ ] Failed uploads have bounded retry behavior
- [ ] Heartbeat works
- [ ] Restart recovery is safe
- [ ] Revoked device is rejected
- [ ] Tracking indicator and tray icon remain visible
- [ ] Installer behavior and uninstall verified

## Privacy

- [ ] Tracking occurs only during an active tracking session
- [ ] Employee can stop tracking
- [ ] No actual keystrokes, key names, or key codes
- [ ] No clipboard data
- [ ] No mouse coordinates
- [ ] No screenshots
- [ ] No browser history
- [ ] No window titles, document names, or full file paths
- [ ] No raw device identifier is persisted
- [ ] No device hashes are shown or returned
- [ ] No passwords or tokens appear in SQLite or logs
- [ ] Legal and HR review completed before deployment

## API and security

- [ ] Authentication, approval, enabled-profile, and permission checks passed
- [ ] Identity and role cannot be supplied by request bodies
- [ ] Device and session ownership checks passed
- [ ] Policy and acknowledgement checks passed
- [ ] Batch, timestamp, future-sample, and offline limits passed
- [ ] Duplicate ingestion is idempotent
- [ ] Cross-device and cross-session ingestion is rejected
- [ ] Revoked-device ingestion is rejected
- [ ] Raw database errors and service-role credentials are absent
- [ ] Rate-limit behavior is understood and accepted

## Regression

- [ ] Existing authentication and registration work
- [ ] Existing employee features work
- [ ] Existing manager features work
- [ ] Existing admin features work
- [ ] Attendance and attendance management are unchanged
- [ ] Location sharing and live map are unchanged
- [ ] Tasks, projects, reports, expenses, and SOS work
- [ ] Directory, clients, departments, and analytics work
- [ ] Existing APIs work
- [ ] Existing dashboards, including Live Activity, are unchanged
- [ ] Existing roles and permissions behavior is unchanged
- [ ] Existing tables and columns were not renamed or removed
- [ ] Existing features do not depend on the desktop agent

## Operational acceptance

- [ ] Retention scheduler limitation has an approved follow-up plan
- [ ] Daily-summary generation limitation has an approved follow-up plan
- [ ] Process-local rate limiter is acceptable for the deployment topology
- [ ] Single-tenant limitation is accepted
- [ ] Unsigned development installer warning is understood
- [ ] Support, recovery, and uninstall procedures were tested
- [ ] Every failed or not-run check is recorded before release approval
