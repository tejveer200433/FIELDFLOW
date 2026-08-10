# Web and application access control

This feature is additive to FIELD-FLOW activity tracking. It does not replace authentication, dynamic RBAC, attendance, location sharing, existing website activity collection, or existing activity APIs.

## What is included

1. Policies can target the organisation, a team, one or more roles, one or more employees, or a registered device.
2. Higher-priority unrestricted policies can exempt selected employees or devices.
3. Category, domain, allow-list, weekday, time, and timezone controls are supported.
4. Employees can request access to a website, category, or native application.
5. Managers can approve once, for a shift, project, seven days, or as a long-lived exception.
6. Approved access is returned on the next heartbeat; the extension refreshes local rules every minute.
7. Extension heartbeats are monitored. A missing or disabled extension creates an alert for in-scope managers and authorised admins.
8. The Windows agent closes configured restricted foreground applications and records a privacy-safe event.
9. Managers and admins receive access-request, decision, extension-health, and restricted-application notifications.
10. The activity pages show policy administration, extension health, request history, and aggregate restriction analytics.

Only domain names, executable names, event type, device association, and timestamps are recorded for this feature. URLs, page titles, typed text, passwords, messages, clipboard data, and file contents are not collected.

## Deployment order

1. Deploy migration `supabase/migrations/202608100001_web_access_control.sql` to the same Supabase project used by FIELD-FLOW.
2. Confirm the `fieldflow-web-access-health` Cron job exists. The migration creates it automatically when `pg_cron` is installed and the migration role can schedule jobs.
3. Deploy the updated Next.js application.
4. Package and deploy browser extension version 0.4.0.
5. Build and deploy desktop agent version 0.4.0.
6. In **Admin > Monitoring Settings**, create a scoped rule. For an exemption, create a higher-priority rule for that employee/device and clear **Restrict this scope**.

## Extension-removal protection

FIELD-FLOW detects a stopped extension heartbeat after five minutes and alerts managers/admins. An ordinary extension cannot prevent a user with local browser control from uninstalling it. On managed company devices, deploy the signed extension with the browser vendor's enterprise force-install policy to prevent removal. Personal or unmanaged devices provide detection and alerting, not tamper-proof prevention.

## Native application enforcement

Native application restriction requires the FieldFlow Windows desktop agent to be signed in and running. The agent checks only the foreground executable name and never inspects application content. Hard OS-level prevention on managed devices should additionally use Windows AppLocker or Windows Defender Application Control.

## Rollback

Disable or delete the new web-access rules to stop enforcement. Existing FIELD-FLOW features remain intact. Do not edit or roll back older activity, attendance, RBAC, or location migrations.
