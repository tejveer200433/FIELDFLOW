-- Periodic desktop screenshots. Additive only: existing monitoring_policies rows
-- default to collect_screenshots = false, so no existing employee is captured
-- until an admin explicitly opts in. Screenshot bytes never pass through this
-- app's own API routes -- the desktop agent registers a capture here (which
-- validates policy state and the exclude list, and returns a server-chosen
-- path), then uploads the JPEG bytes directly to Supabase Storage at that
-- exact path. An excluded-app capture is rejected at registration, before any
-- bytes ever leave the device.

alter table public.monitoring_policies
  add column collect_screenshots boolean not null default false,
  add column screenshot_interval_seconds integer not null default 240,
  add column screenshot_excluded_apps text[] not null default '{}';

create table public.activity_screenshots (
  id uuid primary key default gen_random_uuid(),
  local_sample_id text not null,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.employee_devices(id) on delete cascade,
  tracking_session_id uuid not null references public.tracking_sessions(id) on delete cascade,
  captured_at timestamptz not null,
  storage_path text not null check (char_length(storage_path) between 1 and 500),
  active_application text check (active_application is null or char_length(active_application) between 1 and 120),
  byte_size integer not null default 0 check (byte_size between 0 and 8388608),
  purge_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(employee_id, local_sample_id),
  unique(storage_path)
);
create index activity_screenshots_employee_time_idx
  on public.activity_screenshots(employee_id, captured_at desc);

alter table public.activity_screenshots enable row level security;
create policy activity_screenshots_read on public.activity_screenshots for select to authenticated using (
  employee_id = auth.uid() or public.has_permission('activity.view_all') or public.is_owner(auth.uid())
  or (public.has_permission('activity.view_team') and public.is_team_supervisor_for(employee_id))
);
revoke insert, update, delete on public.activity_screenshots from authenticated;
grant select on public.activity_screenshots to authenticated;

-- Storage bucket: private, JPEG-only, 5MB cap. No authenticated delete policy
-- at all -- only the service-role retention job (below) can ever remove a
-- screenshot blob.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('activity-screenshots','activity-screenshots',false,5242880,array['image/jpeg'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists activity_screenshots_upload on storage.objects;
drop policy if exists activity_screenshots_view on storage.objects;
create policy activity_screenshots_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'activity-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.activity_screenshots shot
    where shot.storage_path = name and shot.employee_id = auth.uid()
  )
);
create policy activity_screenshots_view on storage.objects for select to authenticated using (
  bucket_id = 'activity-screenshots'
  and exists (
    select 1 from public.activity_screenshots shot
    where shot.storage_path = name
      and (
        shot.employee_id = auth.uid()
        or public.has_permission('activity.view_all')
        or public.is_owner(auth.uid())
        or (public.has_permission('activity.view_team') and public.is_team_supervisor_for(shot.employee_id))
      )
  )
);

-- Extend activity_activate_policy again with the three screenshot fields.
drop function if exists public.activity_activate_policy(
  boolean, integer, integer, integer, integer, integer, boolean, boolean, integer, boolean, text[], boolean
);

create or replace function public.activity_activate_policy(
  p_tracking_enabled boolean,
  p_idle_threshold_seconds integer,
  p_sample_interval_seconds integer,
  p_upload_interval_seconds integer,
  p_offline_sync_limit_seconds integer,
  p_heartbeat_interval_seconds integer,
  p_collect_application_names boolean,
  p_require_acknowledgement boolean,
  p_retention_days integer,
  p_website_blocking_enabled boolean default false,
  p_blocked_domains text[] default '{}',
  p_collect_coding_project_names boolean default false,
  p_collect_screenshots boolean default false,
  p_screenshot_interval_seconds integer default 240,
  p_screenshot_excluded_apps text[] default '{}'
)
returns public.monitoring_policies
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version integer;
  created_policy public.monitoring_policies;
  normalized_domains text[];
  normalized_excluded_apps text[];
begin
  if not (
    public.has_permission('activity.policies.manage')
    or public.is_owner(auth.uid())
  ) then raise exception 'Monitoring policy administration required'; end if;
  if p_idle_threshold_seconds not between 30 and 86400
     or p_sample_interval_seconds not between 10 and 3600
     or p_upload_interval_seconds not between 30 and 86400
     or p_offline_sync_limit_seconds not between 0 and 2592000
     or p_heartbeat_interval_seconds not between 15 and 3600
     or p_retention_days not between 1 and 3650
     or p_screenshot_interval_seconds not between 180 and 300 then
    raise exception 'Invalid monitoring policy settings';
  end if;

  select array_agg(distinct lower(btrim(domain)))
  into normalized_domains
  from unnest(coalesce(p_blocked_domains, '{}')) as domain
  where btrim(domain) <> '';
  normalized_domains := coalesce(normalized_domains, '{}');
  if array_length(normalized_domains, 1) > 50 then
    raise exception 'A monitoring policy cannot list more than 50 blocked domains';
  end if;
  if exists (
    select 1 from unnest(normalized_domains) as domain
    where char_length(domain) > 253
       or domain !~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
  ) then raise exception 'Invalid blocked domain'; end if;

  select array_agg(distinct lower(btrim(app)))
  into normalized_excluded_apps
  from unnest(coalesce(p_screenshot_excluded_apps, '{}')) as app
  where btrim(app) <> '';
  normalized_excluded_apps := coalesce(normalized_excluded_apps, '{}');
  if array_length(normalized_excluded_apps, 1) > 50 then
    raise exception 'A monitoring policy cannot list more than 50 excluded applications';
  end if;
  if exists (
    select 1 from unnest(normalized_excluded_apps) as app
    where char_length(app) not between 1 and 120
       or app !~ '^[a-z0-9 ._-]+$'
  ) then raise exception 'Invalid excluded application name'; end if;

  perform pg_advisory_xact_lock(hashtext('fieldflow.monitoring_policy'));
  select coalesce(max(policy_version),0)+1 into next_version
  from public.monitoring_policies;
  update public.monitoring_policies set is_active=false where is_active;
  insert into public.monitoring_policies(
    policy_version, is_active, tracking_enabled, idle_threshold_seconds,
    sample_interval_seconds, upload_interval_seconds,
    offline_sync_limit_seconds, heartbeat_interval_seconds,
    collect_application_names, require_acknowledgement, retention_days,
    website_blocking_enabled, blocked_domains, collect_coding_project_names,
    collect_screenshots, screenshot_interval_seconds, screenshot_excluded_apps,
    created_by
  ) values (
    next_version, true, p_tracking_enabled, p_idle_threshold_seconds,
    p_sample_interval_seconds, p_upload_interval_seconds,
    p_offline_sync_limit_seconds, p_heartbeat_interval_seconds,
    p_collect_application_names, p_require_acknowledgement, p_retention_days,
    p_website_blocking_enabled, normalized_domains, p_collect_coding_project_names,
    p_collect_screenshots, p_screenshot_interval_seconds, normalized_excluded_apps,
    auth.uid()
  )
  returning * into created_policy;
  perform public.activity_write_audit_log(
    null, 'policy.activated', 'monitoring_policy', created_policy.id,
    jsonb_build_object(
      'policyVersion', created_policy.policy_version,
      'trackingEnabled', created_policy.tracking_enabled,
      'websiteBlockingEnabled', created_policy.website_blocking_enabled,
      'collectCodingProjectNames', created_policy.collect_coding_project_names,
      'collectScreenshots', created_policy.collect_screenshots
    )
  );
  return created_policy;
end
$$;

revoke all on function public.activity_activate_policy(
  boolean, integer, integer, integer, integer, integer, boolean, boolean, integer, boolean, text[], boolean, boolean, integer, text[]
) from public;
grant execute on function public.activity_activate_policy(
  boolean, integer, integer, integer, integer, integer, boolean, boolean, integer, boolean, text[], boolean, boolean, integer, text[]
) to authenticated;

-- Register a capture before any bytes are uploaded. Validates device/session/
-- policy ownership and the exclude list, and returns the server-chosen
-- storage path the agent must upload to. Idempotent on local_sample_id so a
-- retried call (e.g. after a client-side timeout) never orphans a path.
create or replace function public.activity_register_screenshot(
  p_tracking_session_id uuid,
  p_local_sample_id text,
  p_captured_at timestamptz,
  p_active_application text,
  p_byte_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tracking_session public.tracking_sessions;
  policy public.monitoring_policies;
  normalized_app text;
  normalized_local_id text;
  storage_path text;
  screenshot_row public.activity_screenshots;
begin
  if auth.uid() is null or not public.has_permission('activity.view_self') then
    raise exception 'Activity self access required';
  end if;

  normalized_local_id := btrim(coalesce(p_local_sample_id, ''));
  if char_length(normalized_local_id) not between 1 and 120
     or normalized_local_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$' then
    raise exception 'Invalid local sample id';
  end if;
  if p_byte_size not between 1 and 8388608 then
    raise exception 'Invalid screenshot size';
  end if;

  select item.* into screenshot_row from public.activity_screenshots item
    where item.employee_id = auth.uid() and item.local_sample_id = normalized_local_id;
  if found then
    return jsonb_build_object(
      'id', screenshot_row.id,
      'storagePath', screenshot_row.storage_path,
      'capturedAt', screenshot_row.captured_at
    );
  end if;

  select item.* into tracking_session from public.tracking_sessions item
    where item.id = p_tracking_session_id and item.employee_id = auth.uid();
  if not found then raise exception 'Tracking session not found'; end if;
  if tracking_session.status <> 'active' or tracking_session.ended_at is not null then
    raise exception 'Tracking session is not active';
  end if;

  select item.* into policy from public.monitoring_policies item
    where item.id = tracking_session.monitoring_policy_id
      and item.policy_version = tracking_session.monitoring_policy_version;
  if not found then raise exception 'Session monitoring policy not found'; end if;
  if not policy.tracking_enabled then raise exception 'Activity tracking is disabled'; end if;
  if not policy.collect_screenshots then raise exception 'Screenshot collection is disabled'; end if;

  if p_captured_at > now() + interval '5 minutes' then
    raise exception 'Screenshot timestamp is in the future';
  elsif p_captured_at < tracking_session.started_at then
    raise exception 'Screenshot predates session start';
  elsif p_captured_at < now() - make_interval(secs => policy.offline_sync_limit_seconds) then
    raise exception 'Screenshot timestamp has expired for offline sync';
  end if;

  normalized_app := lower(btrim(coalesce(p_active_application, '')));
  if normalized_app <> '' and normalized_app = any(policy.screenshot_excluded_apps) then
    raise exception 'Screenshot application is excluded by policy';
  end if;

  storage_path := auth.uid()::text || '/' || tracking_session.id::text || '/'
    || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || replace(gen_random_uuid()::text, '-', '') || '.jpg';

  insert into public.activity_screenshots(
    local_sample_id, employee_id, device_id, tracking_session_id,
    captured_at, storage_path, active_application, byte_size
  ) values (
    normalized_local_id, auth.uid(), tracking_session.device_id, tracking_session.id,
    p_captured_at, storage_path, nullif(normalized_app, ''), p_byte_size
  )
  returning * into screenshot_row;

  return jsonb_build_object(
    'id', screenshot_row.id,
    'storagePath', screenshot_row.storage_path,
    'capturedAt', screenshot_row.captured_at
  );
end
$$;

revoke all on function public.activity_register_screenshot(uuid,text,timestamptz,text,integer) from public;
grant execute on function public.activity_register_screenshot(uuid,text,timestamptz,text,integer) to authenticated;

-- Retention: two-phase because SQL alone cannot delete Storage blobs in this
-- app. These are service_role-only, invoked by a scheduled job outside this
-- migration (Supabase Cron), never reachable by an authenticated client --
-- following the exact trust boundary of activity_close_stale_sessions().
create or replace function public.activity_screenshots_claim_expired(p_limit integer default 200)
returns setof public.activity_screenshots
language plpgsql
security definer
set search_path = public
as $$
declare
  policy public.monitoring_policies;
begin
  select item.* into policy from public.monitoring_policies item where item.is_active;
  if not found then return; end if;

  return query
  update public.activity_screenshots shot
  set purge_claimed_at = now()
  where shot.id in (
    select id from public.activity_screenshots
    where captured_at < now() - make_interval(days => policy.retention_days)
      and (purge_claimed_at is null or purge_claimed_at < now() - interval '10 minutes')
    order by captured_at asc
    limit greatest(1, least(p_limit, 500))
  )
  returning shot.*;
end
$$;
revoke all on function public.activity_screenshots_claim_expired(integer) from public;
revoke all on function public.activity_screenshots_claim_expired(integer) from authenticated;
grant execute on function public.activity_screenshots_claim_expired(integer) to service_role;

create or replace function public.activity_screenshots_confirm_purged(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  purged_count integer;
begin
  with deleted as (
    delete from public.activity_screenshots where id = any(coalesce(p_ids, '{}'))
    returning id
  )
  select count(*) into purged_count from deleted;

  if purged_count > 0 then
    insert into public.activity_audit_logs(actor_user_id, employee_id, action, entity_type, entity_id, metadata)
    values (null, null, 'screenshot.purged', 'activity_screenshot', null, jsonb_build_object('count', purged_count));
  end if;

  return coalesce(purged_count, 0);
end
$$;
revoke all on function public.activity_screenshots_confirm_purged(uuid[]) from public;
revoke all on function public.activity_screenshots_confirm_purged(uuid[]) from authenticated;
grant execute on function public.activity_screenshots_confirm_purged(uuid[]) to service_role;

notify pgrst, 'reload schema';
