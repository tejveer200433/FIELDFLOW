# Admin Workforce Activity localhost testing

## Start

1. Apply the Phase 1 and Phase 2 activity migrations to a non-production Supabase project.
2. Assign `activity.view_all` to the authorised admin role, or use the protected Owner.
3. Start FieldFlow:

   ```powershell
   npm.cmd run dev
   ```

4. Open [http://localhost:3000/admin/activity](http://localhost:3000/admin/activity).
5. Confirm the network panel contains only `/api/activity/*` requests from this page.

## Checklist

1. Open the route signed out and confirm the existing admin authentication flow.
2. Test a non-Owner user without `activity.view_all`; confirm “Module not available” and no workforce request.
3. Confirm a user with only `activity.view_team` is denied.
4. Test Owner or `activity.view_all` access.
5. Generate an active employee session with a recent heartbeat; confirm Active.
6. Generate idle duration above the policy threshold with a recent heartbeat; confirm Idle.
7. Leave a session active with a stale heartbeat; confirm Offline.
8. Stop a session; confirm Not tracking.
9. Test status, date, loaded-page employee, department, device, agent, and sort filters.
10. Confirm Reset filters resets pagination.
11. Configure more than 25 workforce records and test Load more without duplicates.
12. Open employee details and test each history range.
13. Confirm safe device name, platform, OS version, agent version, status, and dates.
14. Confirm device identifiers, hashes, tokens, raw samples, and raw audit metadata never appear.
15. Confirm the audit panel reports the Phase 2 API limitation and does not query Supabase.
16. Test monitoring-disabled and API-error states.
17. Exceed a read rate limit and confirm the safe wait message.
18. Test 320px, 375px, 768px, and desktop widths.
19. Re-test the existing Admin dashboard and Live Activity card.
20. Re-test Analytics, Roles & permissions, and Attendance locations.

## Phase 2 limitations

- Workforce summary cards cover loaded pages only; no organisation-wide aggregate endpoint exists.
- Search, department, device, and agent filters cover loaded pages where data is available.
- Team/department and agent data are not part of `/team`; the page safely enriches matching loaded rows from activity employee/device endpoints.
- Offline time today, project/task context, and last activity sample are absent from the team response.
- No audit-log read endpoint exists.
- Detail history has no timeline pagination metadata.
