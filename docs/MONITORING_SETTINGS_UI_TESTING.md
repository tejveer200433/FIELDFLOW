# Monitoring Settings localhost testing

## Start

1. Apply both activity migrations in a non-production Supabase project.
2. Assign `activity.policies.manage`, or use the protected Owner.
3. Start FieldFlow:

   ```powershell
   npm.cmd run dev
   ```

4. Open [http://localhost:3000/admin/monitoring-settings](http://localhost:3000/admin/monitoring-settings).

## Checklist

1. Test a user without `activity.policies.manage`; confirm denial and no policy/device calls.
2. Test Owner or an authorised policy administrator.
3. With no active policy, confirm monitoring-disabled and empty-policy states.
4. Leave Enable monitoring unchecked and create an initial disabled version.
5. Check Enable monitoring and submit; cancel the confirmation once.
6. Retry and review collection, application-name, intervals, retention, acknowledgement, visible-agent, attendance, and location information in the confirmation.
7. Confirm a new version is created rather than editing the prior version.
8. Enter sample interval `9`; confirm client validation rejects it.
9. Enter heartbeat interval `3601`; confirm validation rejects it.
10. Enter retention `0` or `3651`; confirm validation rejects it.
11. Reduce retention and cancel/accept its additional confirmation.
12. Toggle application-name collection and acknowledgement requirement.
13. Confirm exact changes appear before submission.
14. Test a policy conflict or concurrent version creation and confirm a safe server error.
15. Confirm policy-history and acknowledgement panels clearly identify missing Phase 2 read APIs.
16. Confirm acknowledgement hashes never appear.
17. Revoke a device; cancel once, then confirm.
18. Reactivate a revoked device; cancel once, then confirm.
19. Confirm device identifiers and hashes never appear.
20. Test a manage-only role without activity view permission; the Phase 2 device-list endpoint may safely return 403 while policy editing remains usable.
21. Confirm the audit panel does not display unrestricted metadata.
22. Test API failure and rate-limit states.
23. Test mobile and desktop widths.
24. Re-test existing Admin settings, dashboard, Analytics, Roles & permissions, and Attendance locations.

## Phase 2 limitations

- Only the active policy can be read; policy history cannot be listed.
- Acknowledgement counts and recent acknowledgement records cannot be read administratively.
- Audit records are append-only but have no safe read endpoint.
- Policy creation and device actions produce server-side audit events, but this UI cannot list them yet.
- `activity.policies.manage` alone is accepted for device mutations but not for device listing; Owner or a separate activity view permission is currently needed to populate the device panel.
- Active policy creation/update timestamps are intentionally absent from the Phase 2 response.
