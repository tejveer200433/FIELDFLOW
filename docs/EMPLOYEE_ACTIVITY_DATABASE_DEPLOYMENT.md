# Employee activity database deployment

## Required migration order

Apply these immutable files in timestamp order:

1. `202607280001_employee_activity_tracking.sql`
2. `202607280002_activity_api_functions.sql`
3. `202607290001_activity_security_hardening.sql`

The first migration creates the eight tables, permissions, bootstrap policy, indexes, grants, and RLS. The second creates transactional activity functions. The third removes direct authenticated write grants and adds bounded API ingestion plus recursive audit-metadata protection.

Never edit a migration after it has been applied. Create a later migration so repository history and the Supabase migration ledger remain reproducible.

## Supabase SQL Editor

For an existing development project that has been managed manually:

1. Back up the project.
2. Open Supabase SQL Editor.
3. Run each complete migration in the order above.
4. Do not rerun a partially applied migration without checking which objects exist.
5. Record manual application in your deployment log. If later adopting the CLI, reconcile migration history carefully rather than rerunning SQL.

The preferred repeatable method is the Supabase CLI because `db push` records migration history.

## Supabase CLI

On a disposable local stack:

```powershell
supabase start
supabase db reset
```

For a linked development project:

```powershell
supabase login
supabase link
supabase migration list
supabase db push --dry-run
supabase db push
```

`db push` applies unapplied migration files in order. Do not use remote reset against production. See the official [Supabase migration documentation](https://supabase.com/docs/guides/deployment/database-migrations).

## Verify eight tables

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'monitoring_policies',
    'monitoring_policy_acknowledgements',
    'employee_devices',
    'tracking_sessions',
    'activity_samples',
    'agent_heartbeats',
    'activity_daily_summaries',
    'activity_audit_logs'
  )
order by table_name;
```

Expected row count: `8`.

## Verify four permissions

```sql
select key, name, group_name
from public.permissions
where key in (
  'activity.view_self',
  'activity.view_team',
  'activity.view_all',
  'activity.policies.manage'
)
order by key;
```

Expected row count: `4`.

## Verify default grants

```sql
select lower(r.name) as role_name, p.key
from public.role_permissions rp
join public.roles r on r.id = rp.role_id
join public.permissions p on p.id = rp.permission_id
where p.key like 'activity.%'
order by role_name, p.key;
```

Expected defaults:

- Standard Employee: `activity.view_self`
- Management: `activity.view_team`
- Owner: all four permissions

The existing RBAC guard may intentionally defer these inserts when migrations run without the protected Owner/trusted migration identity. If notices report deferred grants, assign them through the existing Owner Roles and Permissions UI. Do not disable or weaken the guard.

## Verify active policy and safe default

```sql
select policy_version, is_active, tracking_enabled,
       collect_application_names, require_acknowledgement, retention_days
from public.monitoring_policies
where is_active;
```

Expected immediately after migration: version `1`, `tracking_enabled = false`, application names disabled, acknowledgement required, retention `90`.

## Verify RLS and privileges

```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'monitoring_policies','monitoring_policy_acknowledgements',
    'employee_devices','tracking_sessions','activity_samples',
    'agent_heartbeats','activity_daily_summaries','activity_audit_logs'
  )
order by relname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name like any (array[
    'monitoring_policies','monitoring_policy_acknowledgements',
    'employee_devices','tracking_sessions','activity_samples',
    'agent_heartbeats','activity_daily_summaries','activity_audit_logs'
  ])
order by table_name, grantee, privilege_type;
```

All eight tables must have RLS enabled. After hardening, `authenticated` should have activity-table SELECT privileges but no direct INSERT/UPDATE/DELETE privileges.

## RLS testing

Use a disposable database and the scenarios in `EMPLOYEE_ACTIVITY_RLS_TESTING.md`. Test through real authenticated Supabase clients wherever possible so `auth.uid()` and the existing permission functions match production behavior.

## Rollback before production data exists

Rollback is destructive and is suitable only for a disposable development database with no required monitoring data:

1. Stop the web and desktop agent.
2. Back up the database.
3. Drop activity functions introduced by migrations 2 and 3.
4. Drop the eight activity tables in foreign-key-safe reverse order.
5. Remove the four activity permissions only after removing their role grants.
6. Reload the PostgREST schema.

Prefer restoring a known development backup or `supabase db reset` locally. Once production monitoring data exists, use a forward migration and an approved retention/export plan instead of dropping objects.

## Single-tenant limitation

Policies and workforce-wide permissions are scoped to the entire Supabase project. There is no `organisation_id` on the new tables. Do not host multiple independent organisations in one project without a separately designed tenant key and tenant-aware RLS migration.
