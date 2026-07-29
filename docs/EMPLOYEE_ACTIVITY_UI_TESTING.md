# Employee My Activity manual testing

## Preparation

1. Apply the Phase 1 and Phase 2 activity migrations to a non-production Supabase project.
2. Start FieldFlow with `npm run dev`.
3. Use test accounts and roles. Do not use production employee activity.
4. Keep the browser network panel open and confirm the page calls only `/api/activity/*`.

## Test checklist

1. **Employee without `activity.view_self`**
   - Sign in as an employee whose dynamic role lacks the permission.
   - Confirm **My Activity** is absent from navigation.
   - Open `/employee/activity` directly.
   - Confirm the existing “Module not available” state appears and no activity API request is made.

2. **Employee with `activity.view_self`**
   - Assign the permission and sign in again.
   - Confirm **My Activity** appears after **Me** and opens `/employee/activity`.
   - Confirm only the signed-in employee’s records appear.

3. **Monitoring disabled**
   - Activate a policy with tracking disabled.
   - Confirm “Monitoring disabled by organisation” appears and Start tracking is disabled.

4. **Policy acknowledgement required**
   - Activate a new acknowledgement-required policy version.
   - Confirm the checkbox starts unchecked and the button starts disabled.
   - Read the visible statement, check it, and acknowledge.
   - Confirm the policy refreshes, success appears, and no `employeeId` is posted.

5. **No registered device**
   - Use an employee with no device.
   - Confirm the page explains that the desktop agent must register one and Start tracking is disabled.

6. **Active registered device**
   - Register and administratively activate a desktop-agent device.
   - Confirm only safe fields appear: name, platform, OS, agent version, status, dates.
   - Confirm identifiers, hashes, tokens, and internal metadata never appear.

7. **Start session**
   - Select an active device and press Start tracking once.
   - Confirm the button disables while submitting and “Tracking active” appears.
   - Confirm the request contains device ID, null project/task, and source `web`, but no employee ID.

8. **Duplicate session rejection**
   - Attempt a second start request while a session is active.
   - Confirm the safe conflict error is shown and the existing session remains active.

9. **Stop session**
   - Press Stop tracking, cancel once, then retry and confirm.
   - Confirm the button disables, the page refreshes, and the server-provided stop time appears.

10. **Device heartbeat online**
    - Send recent agent heartbeats.
    - Confirm last heartbeat, agent version, and reported status appear.

11. **Stale device heartbeat**
    - Stop heartbeats for more than three policy heartbeat intervals, with a minimum threshold of 90 seconds.
    - Confirm an active session changes to “Device offline”; it must not claim the device is live.

12. **Activity summary display**
    - Seed or generate today’s daily summary.
    - Confirm tracked, active, idle, offline time and Activity level match the API.
    - Confirm Activity level is not described as productivity.

13. **Timeline display**
    - Create completed sessions across today, yesterday, and the last seven days.
    - Change the range and confirm grouped session entries are shown, with at most 50 returned entries.

14. **Application collection disabled**
    - Disable application-name collection in the active policy.
    - Confirm the disabled explanation appears and no application names are displayed.

15. **Mobile layout**
    - Test around 320px, 375px, 768px, and desktop widths.
    - Confirm controls remain usable, cards do not overflow, and bottom navigation can scroll horizontally.

16. **API failure state**
    - Temporarily make the activity API unavailable.
    - Confirm a safe error appears without SQL, stack traces, or internal paths.

17. **Rate-limited state**
    - Exceed a Phase 2 activity read or mutation limit in the test environment.
    - Confirm the page asks the employee to wait and does not repeatedly overlap requests.

18. **Existing employee features**
    - Re-test Home, My Work, Attendance, Reports, Expenses, Me, authentication, and location sharing.
    - Confirm their labels, paths, permissions, UI, and behavior are unchanged.

## Known Phase 2 API constraints

- There is no activity-scoped endpoint that lists the employee’s assigned projects or tasks. Phase 3 therefore shows safe optional selectors with only **None** and does not call legacy APIs.
- Employee history is requested through the permission-scoped employee detail endpoint because there is no dedicated `/api/activity/me` endpoint.
- The employee detail response provides session-grouped history, not active/idle/offline event blocks or a pagination cursor.
- Application usage provides sample counts rather than server-computed duration; the UI labels duration as approximate and derives it from the policy sampling interval.
- The detail response does not provide a general “last activity sample” timestamp or pending-sync count, so the UI does not invent either value.

## Polling

With the tab visible, policy, session, device, heartbeat, and employee activity are refreshed every 30–60 seconds according to the heartbeat interval. Polling skips hidden tabs, prevents overlapping requests, and clears its timer when the page unmounts.
