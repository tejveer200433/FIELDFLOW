# Employee activity retention review

## Implemented retention behavior

### Desktop SQLite

- Non-uploaded samples are preserved until accepted, duplicated, or permanently rejected.
- The queue is bounded at 10,000 non-uploaded rows.
- Accepted/duplicate confirmations become `uploaded`.
- Uploaded confirmations older than approximately 24 hours are deleted during a subsequent successful sync transaction.
- Permanent server rejections remain failed for diagnosis and are not retried forever.
- Cleanup is idempotent because it filters by status and timestamp.

### Supabase

The monitoring policy contains `retention_days` (1–3650), but there is currently no scheduled server cleanup function or job. No production scheduler was silently created during Phase 7.

## Data boundaries for a future cleanup

A future approved implementation should:

1. Run with a database-controlled schedule and advisory lock.
2. Read the one active project's current retention policy.
3. Delete `activity_samples`, `agent_heartbeats`, ended `tracking_sessions`, and derived daily summaries older than the calculated cutoff.
4. Never delete active sessions.
5. Retain device records needed for audit/revocation until a separately defined device-retention period.
6. Retain acknowledgement records for policy/legal evidence according to a separately approved rule.
7. Apply a separate, usually longer, retention rule to `activity_audit_logs`.
8. Process bounded batches to avoid long locks.
9. Write a safe aggregate audit event without employee content.
10. Be idempotent and observable.

## Single-tenant behavior

The active policy is project-wide and tables have no organisation key. Any scheduled cleanup would apply to the whole Supabase project. A multi-tenant scheduler must not be introduced until organisation-scoped keys and RLS exist.

## Current acceptance status

Server retention is **not production-ready**. Before deployment, legal/HR/security owners must approve retention periods and engineering must implement, test, monitor, and document a scheduler in a separate authorised change.
