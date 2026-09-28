-- Run in this project's Supabase SQL Editor. All queries are read-only.
begin transaction read only;

-- 1. Actual schema and whether row-level security is enabled.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profiles','expenses','daily_reports','attendance_shifts','employee_devices');

-- 2. Check every policy, including additional permissive policies.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('expenses','daily_reports','attendance_shifts','employee_devices')
order by tablename, policyname;

-- 3. Column privileges and triggers may enforce rules not present in policies.
select table_name, grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name in ('expenses','daily_reports')
  and grantee in ('anon','authenticated')
order by table_name, grantee, privilege_type, column_name;

select c.relname as table_name, t.tgname as trigger_name,
       pg_get_triggerdef(t.oid) as trigger_definition,
       pg_get_functiondef(t.tgfoid) as trigger_function_definition
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal
  and c.relname in ('expenses','daily_reports','attendance_shifts','employee_devices');

-- 4. Actual attendance and device function bodies (including overloads).
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer, p.proacl as grants,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'check_in_with_gps','check_out_with_gps','set_attendance_capture_metadata',
    'activity_set_device_management','activity_write_audit_log','has_permission','is_owner'
  )
order by p.proname, arguments;

-- 5. Corporate-device migration prerequisites and post-install verification.
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'employee_devices'
order by ordinal_position;

-- 6. Whether the project tracks CLI migrations. If non-null, inspect
-- supabase_migrations.schema_migrations separately; SQL Editor deployments
-- may legitimately have no migration-history table.
select to_regclass('supabase_migrations.schema_migrations') as migration_history_table;

rollback;
