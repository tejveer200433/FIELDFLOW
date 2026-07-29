# Employee activity RLS testing

Run these tests only on a disposable development Supabase project. Use synthetic employees and devices. Never run destructive security tests against production monitoring data.

Supabase combines table grants with RLS. The hardening migration intentionally revokes direct writes; authorised mutations use activity functions. Official Supabase guidance explains the [grants and RLS layers](https://supabase.com/docs/guides/api/securing-your-api).

## Test identities and fixtures

Create approved active synthetic accounts:

- Employee A with `activity.view_self`
- Employee B with `activity.view_self`
- Manager A with `activity.view_team`, supervising Employee A only
- Manager B with `activity.view_team`, supervising Employee B only
- Workforce viewer with `activity.view_all`
- Policy manager with `activity.policies.manage`
- Unauthorised approved user with no activity permission

Create one active synthetic device/session for each employee through the activity API. Record UUIDs without putting tokens in this document.

## SQL Editor identity template

The most representative test uses real Supabase clients signed in as each account. For SQL-only diagnostics, replace the UUID and run inside a transaction:

```sql
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}',
  true
);
select auth.uid();
-- assertions here
rollback;
```

The displayed `auth.uid()` must equal the synthetic account UUID. If it does not, stop and use an authenticated client instead.

## Read-isolation tests

### Employee reads own device but not another employee

As Employee A:

```sql
select id, employee_id, status
from public.employee_devices
where employee_id in ('EMPLOYEE_A_UUID', 'EMPLOYEE_B_UUID');
```

Expected: only Employee A rows.

Repeat for `tracking_sessions`, `activity_samples`, `agent_heartbeats`, and `activity_daily_summaries`.

### Manager reads supervised employee only

As Manager A:

```sql
select distinct employee_id
from public.employee_devices
where employee_id in ('EMPLOYEE_A_UUID', 'EMPLOYEE_B_UUID');
```

Expected: Employee A only. Manager B should see Employee B only.

### Workforce permission

As the workforce viewer, the same query may return both synthetic employees. As the unauthorised user, it returns no rows.

## Policy tests

As the policy manager:

```sql
select public.activity_activate_policy(
  false, 300, 60, 300, 86400, 60, false, true, 90
);
```

Expected: a new disabled policy version. Run only in disposable development because it changes the active policy.

As the unauthorised user, the same call must fail with monitoring-policy administration denied.

Direct table insertion/update must fail even for the policy manager:

```sql
update public.monitoring_policies
set tracking_enabled = true
where is_active;
```

Expected: permission denied. Policy writes must use the versioning function.

## Append-only tests

Each statement must fail with insufficient privilege:

```sql
update public.activity_samples set idle_seconds = 0 where id = 'SAMPLE_UUID';
delete from public.activity_samples where id = 'SAMPLE_UUID';

update public.monitoring_policy_acknowledgements
set acknowledgement_text_hash = repeat('a', 64)
where id = 'ACK_UUID';
delete from public.monitoring_policy_acknowledgements where id = 'ACK_UUID';

update public.agent_heartbeats set online_status = 'online' where id = 'HEARTBEAT_UUID';
delete from public.agent_heartbeats where id = 'HEARTBEAT_UUID';

update public.activity_audit_logs set action = 'changed' where id = 'AUDIT_UUID';
delete from public.activity_audit_logs where id = 'AUDIT_UUID';
```

Use a savepoint around each expected failure or execute them separately because PostgreSQL aborts the current transaction after an error.

## Ingestion impersonation tests

The examples use one valid aggregate sample:

```json
[{
  "localSampleId": "rls-test-1",
  "capturedAt": "CURRENT_UTC_TIMESTAMP",
  "keyboardEventCount": 0,
  "mouseEventCount": 0,
  "idleSeconds": 0,
  "activeApplication": null,
  "screenLocked": false
}]
```

As Employee A:

1. Call `activity_ingest_samples` with Employee B's device and Employee A's session. Expected: device not found.
2. Call it with Employee A's device and Employee B's session. Expected: session/device mismatch.
3. Revoke Employee A's device through `activity_update_device`, then ingest. Expected: device revoked.
4. Use a timestamp before session start. Expected per-sample `BEFORE_SESSION_START`.
5. Use a timestamp more than five minutes in the future. Expected `FUTURE_TIMESTAMP`.
6. Repeat the same local ID. Expected duplicate count, not a second row.

Example SQL shape:

```sql
select public.activity_ingest_samples(
  'DEVICE_UUID',
  'SESSION_UUID',
  '[{"localSampleId":"rls-test-1","capturedAt":"2026-07-29T10:00:00Z","keyboardEventCount":0,"mouseEventCount":0,"idleSeconds":0,"activeApplication":null,"screenLocked":false}]'::jsonb
);
```

## Acknowledgement tests

- Employee A can call `activity_acknowledge_policy` only for the exact active version.
- The database always writes `employee_id = auth.uid()`.
- A repeated acknowledgement fails.
- Direct acknowledgement insert/update/delete fails after hardening.

## Audit metadata test

This insert path is available only through approved functions, but the table constraint must also reject nested sensitive keys:

```sql
-- Execute as a database owner in disposable development.
insert into public.activity_audit_logs(action, entity_type, metadata)
values ('test.event', 'test', '{"nested":{"accessToken":"must-not-store"}}');
```

Expected: `activity_audit_metadata_has_no_sensitive_keys` violation. Roll back the transaction.

## Record results

For each identity record:

- account UUID alias, not real name/email;
- permission set;
- query/function used;
- expected row scope or safe error;
- actual result;
- date and tester.

Do not capture JWTs, database passwords, device hashes, or activity contents in test evidence.
