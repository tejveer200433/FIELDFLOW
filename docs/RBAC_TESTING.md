# FieldFlow dynamic RBAC testing

Run `supabase/migrations/202607240001_dynamic_rbac.sql` in the Supabase SQL
Editor only after all earlier FieldFlow migrations have completed successfully.
Deploy the matching application code after the migration succeeds.

## Owner setup

1. Sign in with an existing approved administrator account.
2. Confirm the header shows `Owner`.
3. Open **Settings → Roles & permissions**.
4. Create a role named `Supervisor`.
5. Select only:
   - `tasks.assign`
   - `attendance.view_team`
   - `locations.view_team`
   - `reports.review`
6. Save the role.
7. Create a team named `Noida Field Team`.
8. Select an approved user as supervisor.
9. Select two or more approved employee accounts as members.
10. Assign the `Supervisor` role to the selected supervisor.
11. Confirm the audit log records the role, assignment, and team changes.

## Supervisor scope

1. Sign out and sign in as the selected supervisor.
2. Confirm the header shows `Supervisor`.
3. Confirm the sidebar contains only the permitted team modules.
4. Confirm the Users page contains only members of `Noida Field Team`.
5. Assign a task to a Noida team member.
6. Confirm another team's employee cannot be selected or targeted through the
   API.
7. Confirm attendance, live locations, and reports contain only Noida team
   members.
8. Attempt to request another employee ID manually in an API URL. Expect HTTP
   403 or no rows, depending on the endpoint.

## Employee isolation

1. Sign in as a Standard Employee who belongs to the Noida team.
2. Confirm the header shows the assigned dynamic role.
3. Confirm only self-service navigation is visible.
4. Confirm tasks, project modules, attendance, reports, expenses, submissions,
   and files contain only records owned by or explicitly assigned to that user.
5. Replace a task, assignment, submission, file, report, or expense ID in a
   request with another employee's ID. Expect HTTP 403/404 or no rows.
6. Confirm GPS attendance and geofence check-in/check-out still work.
7. Confirm SOS creation and live-location sharing still work.

## Owner protection

1. Confirm the protected Owner role cannot be disabled, renamed, or edited.
2. Confirm the current protected Owner cannot change their own role in the UI.
3. Attempt to deactivate or reject the last protected Owner. PostgreSQL must
   reject the change.
4. Confirm a non-Owner cannot add permissions to their own role or assign
   themselves another role.

## Regression checks

Run:

```powershell
npm.cmd run build
```

Then test project creation, modules, assignments, employee submissions,
reviewer approval/changes, signed file downloads, task status updates, daily
reports, expenses, attendance history, geofence distances, live map, and SOS
resolution.
