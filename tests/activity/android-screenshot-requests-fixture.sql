-- Synthetic isolated PostgreSQL fixture; never run against a real Supabase project.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema storage;
create schema test;
grant usage on schema public, auth, test to authenticated;
grant usage on schema test to anon;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function public.has_permission(permission text) returns boolean language sql stable as $$ select permission = any(string_to_array(current_setting('test.permissions', true), ',')) $$;
create function public.is_owner(employee uuid) returns boolean language sql stable as $$ select employee = '00000000-0000-4000-8000-000000000001'::uuid $$;
create function public.is_team_supervisor_for(employee uuid) returns boolean language sql stable as $$ select employee::text = any(string_to_array(current_setting('test.team', true), ',')) $$;
create table public.profiles(id uuid primary key);
create table public.employee_devices(id uuid primary key, employee_id uuid, status text, operating_system_version text);
create table public.monitoring_policies(id uuid primary key, is_active boolean, tracking_enabled boolean, collect_screenshots boolean);
create table public.tracking_sessions(id uuid primary key, employee_id uuid, device_id uuid, status text, ended_at timestamptz, monitoring_policy_id uuid);
create table public.activity_screenshots(id uuid primary key, employee_id uuid, device_id uuid, tracking_session_id uuid, captured_at timestamptz, storage_path text);
create table public.device_screenshot_settings(device_id uuid primary key, capture_enabled boolean);
create function public.activity_device_screenshots_enabled(device uuid, employee uuid) returns boolean language sql stable security definer as $$ select coalesce((select capture_enabled from public.device_screenshot_settings where device_id = device), true) $$;
create table storage.objects(bucket_id text, name text);
create table test.audit(employee_id uuid, action text, entity_id uuid);
create function public.activity_write_audit_log(employee uuid, action text, entity text, id uuid, metadata jsonb) returns void language sql security definer as $$ insert into test.audit values(employee, action, id) $$;
create table test.results(label text);
create function test.assert(condition boolean, label text) returns void language plpgsql security definer as $$ begin if condition is not true then raise exception 'ASSERTION FAILED: %', label; end if; insert into test.results values(label); end $$;
create function test.expect_error(statement text, expected text) returns void language plpgsql as $$
declare caught boolean := false;
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm) = 0 then raise exception 'Expected %, got %', expected, sqlerrm; end if;
    caught := true;
  end;
  perform test.assert(caught, 'Rejected: ' || expected);
end $$;
insert into public.profiles select ('00000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid from generate_series(1, 12) value;
insert into public.monitoring_policies values ('00000000-0000-4000-8000-000000000020', true, true, true);
insert into public.employee_devices values
 ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','active','Android 16'),
 ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000011','active','Android 16'),
 ('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000010','active','Windows 11');
insert into public.tracking_sessions values
 ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030','active',null,'00000000-0000-4000-8000-000000000020');
