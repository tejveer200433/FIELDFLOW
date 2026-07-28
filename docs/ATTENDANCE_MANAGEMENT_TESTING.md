# Attendance management manual test guide

## Install

Run these migrations in Supabase SQL Editor in order:

1. `supabase/migrations/20260723_attendance_geofence.sql`
2. `supabase/migrations/202607240001_dynamic_rbac.sql`
3. `supabase/migrations/202607240002_attendance_management.sql`

Use a new SQL Editor query and copy the complete file. Do not run only selected
function sections. The migration preserves existing attendance records and
creates compatibility assignments for existing active locations.

## Owner / attendance administrator

1. Sign in as the protected Owner.
2. Open **Attendance → Planning → Work shifts**.
3. Create a shift:
   - Name: `General shift`
   - Start: `09:00`
   - End: `18:00`
   - Break: `30`
   - Grace: `15`
   - Reminder: `120`
   - Weekly off: Sunday
4. Open **Schedules** and assign the shift to an employee from Monday to
   Saturday.
5. Open **Daily roster** and add one future override with different check-in
   and check-out locations.
6. Open **Holidays** and add one global holiday and one location-specific
   holiday.
7. Open **Geofences → Locations & radius** and verify existing locations.
8. Open **Geofences → Assignments**.
9. Create a team assignment for check-in and check-out.
10. Create a project assignment with an expiry date.
11. Create separate check-in-only and check-out-only assignments.
12. Disable the generated `All employees` compatibility assignment only after
    every test employee has a valid scoped assignment.

Expected:

- Only active and currently valid assignments authorize attendance.
- Employee, team, project, event, weekday, working-hour, and expiry rules are
  enforced in PostgreSQL.
- A daily roster location overrides normal assignments for that date/event.

## Employee

1. Open **Attendance → Today & history**.
2. Confirm the assigned shift, hours, grace period, holiday, or weekly-off
   indicator appears.
3. Check in inside the assigned location.
4. Try check-in outside the radius and confirm the exact server error appears.
5. Start a break and confirm a second break cannot be started.
6. Confirm checkout is blocked while the break is active.
7. End the break and check out inside the permitted checkout location.
8. Confirm break and overtime minutes appear in history.
9. Open **Leave & corrections**.
10. Submit leave and verify overlapping pending/approved leave is rejected.
11. Submit a correction for an existing attendance record.

Expected:

- Check-in status uses the assigned shift start plus grace minutes.
- Approved leave blocks check-in for those dates.
- Breaks and checkout are recorded by secure database functions.
- Corrections cannot modify another employee's attendance.

## Manager / Supervisor

1. Give a role:
   - `attendance.view_team`
   - `attendance.approve`
2. Make the user supervisor of one team.
3. Open **Attendance → Requests**.
4. Approve or reject leave and correction requests.
5. Confirm the supervisor sees only assigned team employees.
6. Confirm another team's private requests and records are unavailable.
7. Leave an employee checked in beyond the scheduled end plus reminder
   threshold and verify the missed-checkout warning appears.

## Payroll

1. Open **Attendance → Payroll**.
2. Select a month.
3. Verify days worked, work minutes, break minutes, overtime, late days, and
   approved leave days.
4. Export CSV.
5. Export Excel-compatible XLS.
6. Open both files and compare totals with the attendance records.

Payroll exports are summaries for payroll processing; final salary and statutory
rules should remain in the payroll/accounting system.
