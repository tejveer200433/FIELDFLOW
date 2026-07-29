# Activity API and RLS integration test matrix

Run both activity migrations in order on a disposable Supabase project before
performing these tests. Never use production employee monitoring data.

## Identities

Create approved active accounts for:

1. Standard Employee A with `activity.view_self`.
2. Standard Employee B with `activity.view_self`.
3. Supervisor with `activity.view_team`, supervising only Employee A.
4. Unrelated Supervisor with `activity.view_team`, supervising only Employee B.
5. Workforce viewer with `activity.view_all`.
6. Monitoring administrator with `activity.policies.manage`.
7. Protected Owner.

## Authentication

- Missing Bearer token returns 401.
- Invalid or expired token returns 401.
- Disabled, rejected, and pending profiles return 403.
- No endpoint accepts employee, role, manager, permission, or organization scope
  from a write request body.

## Self isolation

- Employee A can register and read only A's devices.
- A cannot use B's device ID to start a session, ingest samples, or heartbeat.
- A cannot stop B's session.
- A cannot read B's employee activity endpoint.
- Raw device hashes never appear in API responses.

## Team isolation

- Supervisor can list/read Employee A.
- Supervisor cannot list/read Employee B.
- Unrelated Supervisor cannot list/read Employee A.
- Directly requesting an out-of-team employee ID returns 403 or no rows.
- `activity.view_all` and Owner can read both employees.

## Policies and acknowledgement

- Every authenticated monitored employee can read the active transparency
  policy.
- Tracking cannot start while `tracking_enabled` is false.
- Required acknowledgement blocks session start and ingestion.
- Employee can acknowledge only as self and only the active exact version.
- Duplicate acknowledgement returns a conflict.
- Only `activity.policies.manage` or Owner can activate a new policy version.
- A policy activation retains the old row and leaves exactly one active row.

## Ingestion

- One to 100 valid samples are accepted.
- A repeated `(device_id, local_sample_id)` is counted as a duplicate.
- Negative counters, invalid UTC timestamps, future timestamps, pre-session
  timestamps, expired offline samples, and forbidden fields are rejected.
- Application names are rejected when the active policy disables collection.
- No update/delete path exists for accepted samples.

## Heartbeats

- Heartbeats use database time.
- A revoked device cannot heartbeat.
- A supplied session must belong to the authenticated employee and device.
- Heartbeats sent faster than half the configured interval are rejected.
- Device `last_seen_at` and agent version update in the same transaction.

## SQL assertions

Verify as an authenticated user:

- Direct cross-employee selects return no rows under RLS.
- Direct updates/deletes of samples, acknowledgements, heartbeats, summaries,
  and audit logs fail.
- Team access follows `is_team_supervisor_for()` and does not become global.
- No activity API support function is executable by `anon`.
