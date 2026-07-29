# Manager Team Activity localhost testing

## Preparation

1. Apply the completed Phase 1 and Phase 2 activity migrations to a non-production Supabase project.
2. Confirm the manager’s dynamic role has `activity.view_team` or `activity.view_all`.
3. Confirm team supervision relationships are configured for `activity.view_team`.
4. Start the application:

   ```powershell
   npm.cmd run dev
   ```

5. Open [http://localhost:3000/manager/activity](http://localhost:3000/manager/activity).
6. Keep the browser network panel open. The page must call only `/api/activity/*`.

## Checklist

1. **Authentication**
   - Open the route signed out.
   - Confirm the existing manager authentication flow redirects to sign-in.

2. **Permission guard**
   - Test a manager without both activity view permissions.
   - Confirm Team Activity is absent from navigation.
   - Open the URL directly and confirm “Module not available”; no team activity request should run.

3. **Manager with `activity.view_team`**
   - Assign `activity.view_team`, sign out, and sign in again.
   - Confirm Team Activity appears after Analytics.

4. **Supervised employee visibility**
   - Configure at least one supervised employee with activity records.
   - Confirm the employee appears.

5. **Unrelated employee isolation**
   - Create activity for an employee outside the manager’s supervised teams.
   - Confirm that employee never appears in the list, search, pagination, or drawer.
   - Attempt their detail endpoint manually and confirm the API returns 403.

6. **`activity.view_all`**
   - Test a management-workspace role with `activity.view_all`.
   - Confirm only the workforce records authorised by the server response appear.

7. **Empty team**
   - Use a manager with no supervised employees.
   - Confirm the clear “No supervised employees” state.

8. **Monitoring disabled**
   - Disable the active monitoring policy.
   - Confirm the disabled/unavailable banner while historical authorised records remain readable.

9. **Active status**
   - Start a session and send a recent heartbeat with idle duration below the policy threshold.
   - Confirm Active appears.

10. **Idle status**
    - Send recent heartbeat/activity with idle duration at or above the policy threshold.
    - Confirm Idle appears.

11. **Offline status**
    - Keep a session active but stop heartbeat updates beyond the server threshold.
    - Confirm Offline appears without using missing samples alone as the reason.

12. **Not tracking**
    - Stop the employee session.
    - Confirm Not tracking appears.

13. **Filters**
    - Exercise status, date, device status, sort, and debounced employee search.
    - Confirm Reset filters restores today, all statuses/devices, and name sorting.
    - Note that search/device filtering applies only to the currently loaded authorised page.

14. **Pagination**
    - Configure more than 25 supervised employees.
    - Use Load more and confirm no duplicates.
    - Change a filter and confirm pagination resets to the first page.

15. **Employee detail drawer**
    - Open a row and verify employee, current session, safe device fields, heartbeat, daily totals, timeline, and application summary.
    - Confirm device hashes, tokens, raw heartbeat payloads, and raw samples are absent.

16. **Drawer permission loss**
    - Remove the manager’s activity/team access while the drawer is open, then change its range.
    - Confirm the content is replaced by a safe access-denied state.
    - Refresh the team page and confirm rows clear and the drawer closes.

17. **Timeline**
    - Test Today, Today and yesterday, and Last 7 days.
    - Confirm session-grouped entries appear, not individual activity samples.

18. **Application collection disabled**
    - Disable application-name collection.
    - Confirm “Application-name collection is disabled by your organisation” and no names appear.

19. **API failure**
    - Make an activity endpoint unavailable in the test environment.
    - Confirm a safe error without SQL, stack traces, paths, tokens, or internal metadata.

20. **Rate limiting**
    - Exceed an activity read limit.
    - Confirm the page asks the manager to wait and polling does not overlap requests.

21. **Mobile viewport**
    - Test 320px, 375px, 768px, and desktop widths.
    - Confirm employee cards replace the wide table on small screens and the drawer remains usable.

22. **Existing manager features**
    - Re-test Dashboard, Live Map, Users, Tasks, Projects, Reports, Attendance, Expenses, and Analytics.
    - Confirm their labels, permissions, routes, and behavior are unchanged.
    - Confirm the dashboard Live Activity card is unchanged.
    - Confirm the live team map is unchanged.

## Known Phase 2 API constraints

- `/api/activity/team` scopes correctly but resolves all authorised profiles before applying cursor pagination. Phase 4 still requests pages of 25, but true database-level pagination requires a future additive API version.
- The team endpoint has no employee-search or device-status query filters. Those filters apply only to the currently loaded, already server-scoped page and are labelled accordingly.
- The team endpoint has no authoritative team-wide summary metadata. Summary cards are explicitly labelled as loaded-page totals.
- Team rows do not include project/task IDs, session start time, offline time today, or a last-sample timestamp.
- Employee detail has no dedicated timeline cursor in its response and returns session-level history rather than active/idle/offline event blocks.
- Application usage supplies sample counts, so durations are approximate.
- Existing workspace routing sends Owners to `/admin`; Phase 4 does not change authentication or create an admin activity route.

## Security expectations

- Client-side filters are usability controls only; the activity APIs and RLS enforce scope.
- Managers never provide arbitrary employee IDs through page URLs or form fields.
- A selected employee ID comes only from the scoped team response, and the employee-detail endpoint validates scope again.
- No demo monitoring data is used.
