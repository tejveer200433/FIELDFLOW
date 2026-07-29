# Employee activity API security review

Review date: 2026-07-29.

Scope: all handlers under `src/app/api/activity`, supporting activity libraries, and the three activity migrations.

## Passed checks

| Check | Result | Evidence |
|---|---|---|
| Authentication required | Pass | Every route calls `requireActivitySession`; it validates the Bearer token with Supabase |
| Approval and active profile checked | Pass | Existing `requireSession` rejects inactive or non-approved profiles |
| Identity derived from server session | Pass | Writes use `session.profile.id` or database `auth.uid()` |
| No employee/manager/role trusted from write body | Pass | Strict validation rejects identity, role, permission, and organisation keys |
| Device ownership verified | Pass | `requireOwnedDevice` and database functions bind device to `auth.uid()` |
| Session ownership verified | Pass | `requireOwnedSession` and database functions bind session to employee/device |
| Policy and acknowledgement verified | Pass | Start and ingestion verify active policy, tracking flag, and exact acknowledgement |
| Batch size limited | Pass | JavaScript and database RPC limit batches to 1–100 |
| Timestamp bounds | Pass | UTC validation, future bound, session start, and offline-sync limit |
| Duplicate idempotency | Pass | Unique `(device_id, local_sample_id)` and conflict-safe ingestion |
| Raw database errors hidden | Pass | Unknown errors return `INTERNAL_ERROR`; raw errors are server-side only |
| Device hashes never returned | Pass | All device selects/maps omit `device_identifier_hash` |
| Rate limits applied | Pass with limitation | Every endpoint has a limiter; heartbeat also has a database interval |
| Safe audit metadata | Pass after hardening | Static metadata plus recursive database sensitive-key constraint |
| No service-role key exposed | Pass | Activity source and environment use only the public anonymous key |
| Direct Data API writes blocked | Pass after hardening | Follow-up migration revokes monitoring DML and exposes bounded functions |

## Fixes made during Phase 7

1. Added `202607290001_activity_security_hardening.sql`.
2. Added `activity_ingest_samples`, which rechecks authenticated identity, device/session ownership, policy state, acknowledgement, batch size, sample fields, timestamps, offline limit, application policy, and duplicate IDs.
3. Revoked direct authenticated INSERT/UPDATE grants on monitoring write tables. Existing security-definer functions remain the write path.
4. Added a recursive audit-metadata constraint for sensitive key names.
5. Changed only `/api/activity/ingest` to call the hardened RPC instead of direct table upsert.
6. Extended security contract tests for the RPC and revoked grants.

## Failed checks

No reviewed API check remains failed in source after the hardening migration is applied.

## Remaining limitations

- The JavaScript rate limiter is process-local and resets when the Next.js process restarts. Multiple production instances do not share counters.
- There is no dedicated API read endpoint for policy history, acknowledgement summaries, or audit logs.
- Rate limiting is not a substitute for edge/WAF limits or abuse monitoring.
- Live authenticated endpoint tests were not possible without acceptance-test accounts/tokens.
- The hardening migration must be applied; source code alone does not change an already deployed database.
- Server logs may contain raw internal database error messages for operators, although clients receive safe responses. Production logging access and retention require operational controls.
- This review is technical and is not a penetration test or legal compliance certification.
